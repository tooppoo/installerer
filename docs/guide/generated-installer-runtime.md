# Generated Installer Runtime

`installerer` generates a single POSIX `sh` script named `install.sh`.

The generated script contains a small runtime that parses arguments, detects the host target, resolves GitHub Release asset URLs, downloads an archive and checksum file, verifies the archive checksum, extracts the configured binary entry, and places the binary in the install directory.

This document describes runtime mechanics: how arguments are parsed, how URLs are encoded, how checksum lookup is implemented, and how extraction and binary placement work. Latest/pinned install semantics (what a latest vs. pinned install actually resolves to, the network access boundary, reproducibility differences, and the guarantees and limits of checksum verification) are documented in [the install semantics document](./install-semantics.md). This document does not redefine that semantics; it references it where relevant.

## Arguments

The generated installer accepts:

```text
--version <version>
--install-dir <dir>
--requirements
--check-requirements
--help
```

Omitting `--version` installs the latest release; whether that resolves an actual release tag depends on whether `archive.nameTemplate` contains `{version}` (see [Version Resolution](#version-resolution)).

Passing `--version <version>` installs the pinned release tag. `--version latest` is rejected because latest installs are represented by omitting `--version`.

If `--install-dir` is omitted, the generated script uses `defaults.installDir` from JSON config. When config omits that field, the generator normalizes it to `$HOME/.local/bin`.

JSON config intentionally has no `defaults.version` field.

`--version` and `--install-dir` are **install options**; `--requirements` and `--check-requirements` are **test options** — see [Runtime Requirements Introspection](#runtime-requirements-introspection) below for their behavior and the rule against mixing the two groups.

## Target Detection And Architecture Label Resolution

Both `install_latest` and `install_pin` call `detect_target()` first, then resolve the asset architecture label before rendering the archive asset name. This is two distinct stages, not one (issue #76):

```text
raw runtime OS/architecture (uname -s / uname -m)
  -> canonical_os, canonical_arch
  -> asset_arch_label
  -> archive asset name
```

**Stage 1 — runtime canonicalization.** `detect_target()` reads `uname -s`/`uname -m` and resolves them to a canonical OS/architecture pair. The initial architecture mapping only recognizes real `uname -m` outputs:

```sh
case "$arch" in
  x86_64) arch=x86_64 ;;
  aarch64|arm64) arch=aarch64 ;;
  *) fail "unsupported architecture: $arch" ;;
esac
```

`arm64` (as reported by some `uname -m` builds) canonicalizes to `aarch64`. `amd64` is not accepted here — it is a Release-asset-label spelling, not a `uname -m` output, and is out of scope for this initial mapping. Any other value fails immediately with `unsupported architecture: <value>`, before the configured `os/arch` target list is even consulted. `detect_target()` then checks the canonical `os/arch` pair against the configured `targets` and fails with `unsupported target: <os>/<arch>` if the pair was not selected. `detect_target()` always outputs the canonical lowercase pair; asset-name spelling concerns (`archive.osCase` casing, `architectureLabels`) are applied downstream by `render_archive_asset_name()` and `resolve_asset_arch_label()`.

**Stage 2 — architecture label resolution.** `resolve_asset_arch_label()` maps the canonical OS/architecture pair to the `asset_arch_label` embedded in Release asset names, using a `case` statement generated from `architectureLabels`. The mapping is per OS, so the same canonical architecture may publish under a different label on each OS:

```sh
resolve_asset_arch_label() {
  canonical_os=$1
  canonical_arch=$2

  case "$canonical_os/$canonical_arch" in
    linux/x86_64) asset_arch_label='x86_64' ;;
    linux/aarch64) asset_arch_label='aarch64' ;;
    darwin/x86_64) asset_arch_label='x86_64' ;;
    darwin/aarch64) asset_arch_label='aarch64' ;;
    *) fail "unsupported target: $canonical_os/$canonical_arch" ;;
  esac

  printf '%s\n' "$asset_arch_label"
}
```

The case values shown above are the default mapping — each canonical architecture maps to itself on every OS, the OS-reported name, not a build-tool convention such as Go's GOARCH (`amd64`/`arm64`). A custom `architectureLabels` config (flat, applied to every OS, or per OS — see [the archive format contract](./installer-contract.md#archive-format-contract)) changes only the right-hand side of each case arm, never the left-hand `canonical_os`/`canonical_arch` values or the runtime canonicalization in stage 1. `{arch}` and `{target}` in `archive.nameTemplate` expand to `asset_arch_label`, not to `canonical_arch` — so the same binary target can be published under any configured asset name spelling (`x86_64`, `amd64`, or a custom label such as `x64`) without changing how the generated installer detects the host. Multiple targets may resolve to the same `asset_arch_label` (for example both architectures mapped to `universal`); this is allowed and is treated as a distribution/naming choice, not a validation error.

`asset_arch_label` values are validated at generation time against `^[A-Za-z0-9._+-]+$`, with `.` and `..` rejected explicitly even though they match that pattern (see [the archive template validation design](../design/archive-template-validation.md)). After expansion, the full archive asset filename is re-validated the same way as any other archive filename.

## Version Resolution

`main` dispatches on the presence of `--version`:

- omitted → `install_latest`
- `--version <version>` → `install_pin`
- `--version latest` → rejected, matching the exact lowercase string `latest` only

Both `install_latest` and `install_pin` validate the version as a Git tag name inside the runtime, using a helper that mirrors checking `refs/tags/<version>` as a Git refname. The generated script does not depend on the `git` command. Empty values, `latest`, whitespace, control characters, and other refname-invalid values are rejected as unsafe version strings.

What `install_latest` resolves for each template shape — the checksum-index scan for a `{version}` template, and the direct `latest/download` fetches for a versionless template — is defined in [the latest install semantics](./install-semantics.md#latest-install-semantics). The notes below cover only the runtime implementation of that semantics:

- The checksum-index scan reads the index's filename column as an exact whitespace-delimited field, using the same field parsing as checksum lookup.
- The resolved version is logged before the tag-specific download. A versionless template's latest install logs the install source as `latest` and logs no resolved version.
- `install_pin` never performs the checksum-index scan.
- The release tag version is used two ways, which are kept distinct: it is percent-encoded as a URL path segment for the GitHub Release URL, and it is expanded raw (not URL-encoded) into the `{version}` placeholder of the archive filename template. The expanded archive filename is then re-validated, so a Git-tag-valid version producing an unsafe archive filename (for example a tag containing `/`) is rejected.

`install_pin` behaves the same regardless of `{version}` presence: the `--version` value is validated as a Git tag name, percent-encoded as a URL path segment, and used in the `/releases/download/<encoded version>/<asset>` URL.

## Runtime Dependencies

The generated script is POSIX `sh`, but it intentionally depends on external commands for practical and safer runtime behavior.

See [the runtime dependencies reference](../reference/runtime-dependencies.md) for the generated, authoritative list of required commands — it is derived from `packages/core/src/runtimeDependencies/definitions.ts` (issue #75), the single source of truth also used by the Web UI and by the generated installer's own `--requirements` / `--check-requirements` (below).

`curl` has no fallback in the MVP. If any required command is missing, the generated script stops with a clear error.

## Runtime Requirements Introspection

Every generated installer accepts two additional, mutually exclusive-with-install options:

```text
--requirements
--check-requirements
```

`--requirements` prints the runtime requirements resolved for this specific config — the same underlying typed dependency definitions as [the runtime dependencies reference](../reference/runtime-dependencies.md) (`packages/core/src/runtimeDependencies/definitions.ts`), but resolved to this config's single archive-format command and annotated with per-dependency reasons, the POSIX `sh` premise, and the network/filesystem items — and exits `0`. It does not perform target detection, install-dir resolution, dependency checks, network access, or filesystem writes.

`--check-requirements` probes every checkable dependency with `command -v` and reports `ok:`/`missing:` for each, without stopping at the first missing command — it aggregates and reports all of them, then exits `0` if every checkable dependency is present or non-zero otherwise. Non-checkable items (network access, filesystem write permission) are listed under a trailing `Not checked:` section instead of being probed. POSIX `sh` itself is listed as a `Runtime premise:`, not as a checkable command.

Both options are terminal: they run before any install-flow work and never call `install_latest` / `install_pin`. They classify as **test options**, distinct from the **install options** `--version` / `--install-dir`; combining a test option with an install option (e.g. `--version v1.0.0 --requirements`) is rejected. `--requirements --check-requirements` together is allowed and runs both, in that order, with the exit code following `--check-requirements`.

## URL Generation And Encoding

Generated installers download only from GitHub Release asset URLs for the configured repository.

The runtime percent-encodes URL path segments separately. It does not encode a complete URL as one string.

The encoded path segments are:

- owner
- repo
- release tag version
- archive asset filename
- checksum filename

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

The digest found by that lookup is checked for shape before the archive is downloaded. It is accepted only when it is exactly 64 characters long and every character is one of `0-9`, `a-f`, or `A-F`. The check uses an explicit character list rather than a named character class or a range, so the accepted set does not shift with the host locale. An accepted digest is then normalized to lowercase.

If `sha256sum` exists, the script uses `sha256sum -c -`. Otherwise, if `shasum` exists, it runs `shasum -a 256` and compares the computed digest directly. Both compare against the normalized value, so a checksum file is accepted or rejected identically whichever command the host provides.

Three checksum failures are hard errors, kept distinct from each other:

- No row for the archive asset filename, or a matching row carrying no digest field: `checksum entry not found for <asset>`.
- A digest field that is not 64 hexadecimal characters: `malformed checksum for <asset>`. The install stops before the archive is downloaded, and the rejected value — release content the installer does not trust — is not echoed back; the message names the asset and the expected shape only.
- A well-formed digest that the downloaded archive does not match: `archive checksum mismatch`.

## Archive Extraction Policy

`binary.pathInArchive` is treated as an archive-relative file path. The runtime rejects empty paths, absolute paths, directory paths, backslash paths, `.` or `..` path segments, and any path whose whole value begins with `-`. This validation runs before `tar`/`unzip` is invoked and reaches the same conclusion as the config-time check, so an unsafe path is rejected consistently at both stages.

The runtime extracts only the configured binary entry.

For `tar.gz`:

```sh
tar -xzf "$archive_path" -C "$extract_dir" -- "$BINARY_PATH_IN_ARCHIVE"
```

For `zip`:

```sh
unzip -q "$archive_path" "$BINARY_PATH_IN_ARCHIVE" -d "$extract_dir"
```

The whole-value leading-hyphen rule keeps the extracted path from being read as a `tar`/`unzip` option. The `zip` command passes the member name without a `--` separator, so a value such as `-x` or `-d` would otherwise be parsed as an option rather than an archive member, breaking the extract-only-the-configured-entry policy. A hyphen inside a later segment, such as `bin/-binary`, is allowed because the argument as a whole still does not begin with `-`.

If the entry is missing, extraction fails with a clear error. The MVP does not inspect every other archive entry.

After extraction, the runtime rejects the install target if it is a symlink before checking whether it is a regular file:

```sh
[ ! -L "$extracted_binary" ]
[ -f "$extracted_binary" ]
```

## Binary Placement

The runtime places the binary as `binary.name` inside the selected install directory.

Placement uses a temporary file in the install directory, created with `mktemp` so its name is unpredictable rather than derived from `$$`:

```sh
install_tmp=$(mktemp -- "$INSTALL_DIR/.$BINARY_NAME.tmp.XXXXXX")
cp -- "$extracted_binary" "$install_tmp"
chmod -- 755 "$install_tmp"
mv -- "$install_tmp" "$INSTALL_DIR/$BINARY_NAME"
```

This avoids directly overwriting the destination before the copy and permission setup have succeeded.

The installed binary's mode is always `0755`, set explicitly rather than derived from `+x`, the extracted archive entry's stored mode, or `cp`'s mode-preservation behavior. `mktemp` creates `install_tmp` with mode `0600`; `chmod -- 755` then fixes the mode to an exact value, so the final mode never depends on the invoking shell's `umask`, the platform's `cp` implementation, or excess permission bits (setuid/setgid/sticky, group/world-write) an archive entry might carry. See [the installed binary permission mode ADR](../adr/20260710T175612Z_installed-binary-permission-mode.md) for the rationale.

## Non-Goals

The generated runtime does not:

- call the GitHub API
- access non-GitHub-Release URLs
- perform cosign verification
- verify SBOMs
- install shell completions
- integrate with package managers
- generate a Windows-native installer
