# Generated Installer Runtime

`installerer` generates a single POSIX `sh` script named `install.sh`.

The generated script contains a small runtime that parses arguments, detects the host target, resolves GitHub Release asset URLs, downloads an archive and checksum file, verifies the archive checksum, extracts the configured binary entry, and places the binary in the install directory.

## Arguments

The generated installer accepts:

```text
--version <version>
--install-dir <dir>
--help
```

Omitting `--version` installs the latest release according to the configured resolver.

Passing `--version <version>` installs the pinned release tag. `--version latest` is rejected because latest installs are represented by omitting `--version`.

If `--install-dir` is omitted, the generated script uses `defaults.installDir` from JSON config. When config omits that field, the generator normalizes it to `$HOME/.local/bin`.

JSON config intentionally has no `defaults.version` field.

## Version Resolution

`main` dispatches on the presence of `--version`:

- omitted → `install_latest`
- `--version <version>` → `install_pin`
- `--version latest` → rejected, matching the exact lowercase string `latest` only

Both `install_latest` and `install_pin` validate the version as a Git tag name inside the runtime, using a helper that mirrors checking `refs/tags/<version>` as a Git refname. The generated script does not depend on the `git` command. Empty values, `latest`, whitespace, control characters, and other refname-invalid values are rejected as unsafe version strings.

For the `release_version_file` resolver, `install_latest` downloads the configured `VERSION` asset from the GitHub Release `latest/download` URL and reads its content as the release tag name:

- The content is treated as a single line holding the release tag name.
- Only a single trailing `LF` or `CRLF` is removed as a line terminator.
- Any remaining `CR` or `LF` makes it a multiple-line `VERSION`, which is rejected.
- Empty content is rejected.
- Leading and trailing whitespace is not auto-trimmed; whitespace that violates Git tag validation is rejected as an unsafe version string.

The resolved version is logged before download. `install_pin` never fetches the `VERSION` asset.

The release tag version is used two ways, which are kept distinct: it is percent-encoded as a URL path segment for the GitHub Release URL, and it is expanded raw (not URL-encoded) into the `{version}` placeholder of the archive filename template. The expanded archive filename is then re-validated so that a Git-tag-valid version producing an unsafe archive filename (for example a tag containing `/`) is rejected.

The `installerer` browser app never fetches, generates, places, or manages the `VERSION` asset. It only emits an installer script that performs this resolution at runtime.

For the `latest_asset` resolver, `install_latest` does not resolve a release tag at all. It downloads the checksum file and the archive asset directly from the GitHub Release `latest/download` URL:

- The archive filename is rendered from a versionless template. Because no release tag is resolved, `latest_asset` rejects `archive.nameTemplate` values that contain `{version}` at generation time as a hard error.
- The install source is logged as `latest`; no resolved version is logged.
- The checksum file and the archive asset are fetched with two separate requests to `latest/download`. If the latest release changes between those requests, the checksum file and the archive can come from different releases. That inconsistency surfaces as a checksum mismatch and stops with a hard error. `latest_asset` does not pin the latest install to a single release tag; use `release_version_file` when an atomic latest resolution is required.

`install_pin` for `latest_asset` behaves like the pinned install for `release_version_file`: the `--version` value is validated as a Git tag name, percent-encoded as a URL path segment, and used in the `/releases/download/<encoded version>/<asset>` URL. The archive filename is still rendered from the versionless template, so the URL-encoded version is never used as part of the archive filename.

## Runtime Dependencies

The generated script is POSIX `sh`, but it intentionally depends on external commands for practical and safer runtime behavior.

Required commands for every generated installer:

- `uname`
- `mktemp`
- `rm`
- `mkdir`
- `cp`
- `mv`
- `chmod`
- `curl`
- `awk`
- `grep`
- `od`
- `tr`
- `cut`
- `sha256sum` or `shasum`

Archive-format-specific commands:

- `tar` when `archive.format` is `tar.gz`
- `unzip` when `archive.format` is `zip`

`curl` has no fallback in the MVP. If any required command is missing, the generated script stops with a clear error.

## URL Generation And Encoding

Generated installers download only from GitHub Release asset URLs for the configured repository.

The runtime percent-encodes URL path segments separately. It does not encode a complete URL as one string.

The encoded path segments are:

- owner
- repo
- release tag version
- archive asset filename
- checksum filename
- version file name, for `release_version_file`

Encoding is byte-wise over the UTF-8 bytes emitted by the shell environment. Space is encoded as `%20`, `/` as `%2F`, and non-ASCII text as percent-encoded UTF-8 bytes.

## Remote Asset Names And Local Paths

Remote asset names are kept separate from local temporary paths.

The archive asset name is used for checksum lookup and URL path generation. It is not appended to the temporary directory as a local filename.

The generated runtime uses fixed local paths:

```sh
archive_path="$tmpdir/archive"
checksum_path="$tmpdir/checksums"
extract_dir="$tmpdir/extract"
```

## Checksum Verification

The MVP supports only SHA-256.

The checksum file is expected to contain a digest and filename field. Lookup uses exact field equality:

```sh
awk -v name="$archive_asset_name" '$2 == name { print $1; found=1; exit } ...'
```

The archive asset filename is not treated as a regular expression, glob, or shell pattern.

If `sha256sum` exists, the script uses `sha256sum -c -`. Otherwise, if `shasum` exists, it runs `shasum -a 256` and compares the computed digest directly.

A missing checksum entry or checksum mismatch is a hard error.

## Archive Extraction Policy

`binary.pathInArchive` is treated as an archive-relative file path. The runtime rejects empty paths, absolute paths, directory paths, backslash paths, and `.` or `..` path segments.

The runtime extracts only the configured binary entry.

For `tar.gz`:

```sh
tar -xzf "$archive_path" -C "$extract_dir" -- "$BINARY_PATH_IN_ARCHIVE"
```

For `zip`:

```sh
unzip -q "$archive_path" "$BINARY_PATH_IN_ARCHIVE" -d "$extract_dir"
```

If the entry is missing, extraction fails with a clear error. The MVP does not inspect every other archive entry.

After extraction, the runtime rejects the install target if it is a symlink before checking whether it is a regular file:

```sh
[ ! -L "$extracted_binary" ]
[ -f "$extracted_binary" ]
```

## Binary Placement

The runtime places the binary as `binary.name` inside the selected install directory.

Placement uses a temporary file in the install directory:

```sh
install_tmp="$INSTALL_DIR/.$BINARY_NAME.tmp.$$"
cp "$extracted_binary" "$install_tmp"
chmod +x "$install_tmp"
mv "$install_tmp" "$INSTALL_DIR/$BINARY_NAME"
```

This avoids directly overwriting the destination before the copy and executable permission setup have succeeded.

## Non-Goals

The generated runtime does not:

- call the GitHub API
- access non-GitHub-Release URLs
- perform cosign verification
- verify SBOMs
- install shell completions
- integrate with package managers
- generate a Windows-native installer
