# Installer Contract

This document defines the minimum contract assumed by `installerer` and by the installer scripts it generates.

`installerer` is a browser-based installer generator. It generates an `install.sh` script for GitHub Release assets. It is not a package manager, release pipeline, signing system, or GitHub API client.

## Scope

`installerer` targets projects that publish installable CLI archives as GitHub Release assets.

The generated installer assumes that each supported release follows the resolver-specific asset layout described below.

The browser app itself:

- does not call the GitHub API
- does not call a backend
- does not require authentication or tokens
- does not fetch Release assets
- does not fetch, generate, place, or manage a `VERSION` asset
- does not verify checksums at generation time

The generated installer script performs runtime work such as target detection, version resolution, download, checksum verification, archive extraction, and binary placement.

## Browser UI Boundary

The primary input surface of the browser app is the form. Users are not asked to hand-write JSON.

- The form values are used to build the JSON config that is handed to the generator core. The UI does not display this JSON config; it is an internal handoff to the generator, not a user-facing artifact.
- The generated installer is shown as text. Users copy and paste it to save it as `install.sh`.
- The MVP does not provide a file download UI for the generated installer.
- The MVP does not allow editing this document from the UI.

The browser app displays this contract document from a build-time generated module. It does not fetch documentation from GitHub or a backend at runtime.

## Generated Installer Boundary

The generated installer is a single POSIX `sh` script named `install.sh`.

The script contains a small runtime with separate latest and pinned install paths:

- `main` parses arguments and dispatches
- `install_latest` runs when `--version` is omitted
- `install_pin` runs when `--version <version>` is provided

`--version latest` is rejected because latest installs are represented by omitting `--version`.

Version selection belongs to the generated installer's runtime interface, not to the generator config. The JSON config therefore has no `defaults.version` field.

The generated installer does not:

- call the GitHub API
- access non-GitHub-Release URLs
- perform cosign verification in the MVP
- verify SBOMs or provenance in the MVP
- generate a Windows-native installer

## Archive Format Contract

The generator core supports two archive formats, selectable as `archive.format` in the browser form:

- `tar.gz`
- `zip`

The archive format determines an archive-format-specific runtime dependency of the generated installer:

- `archive.format = "tar.gz"` requires `tar` at runtime
- `archive.format = "zip"` requires `unzip` at runtime

The `archive.nameTemplate` must end with the suffix matching the selected format (`.tar.gz` or `.zip`).

## Runtime Dependencies

The generated artifact is a POSIX `sh` script, but it depends on documented external commands.

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

If any required command is missing, the generated installer should stop with a clear error.

## Supported Resolvers

`installerer` supports two resolver types:

- `release_version_file`
- `latest_asset`

### `release_version_file`

Use `release_version_file` when latest installs should resolve to an actual release tag.

Each release must provide:

```text
VERSION
checksums.txt
<archive assets>
```

`VERSION` must contain the release tag name as a single line. The generated installer downloads the `VERSION` asset from the latest release URL, reads it as the resolved release tag, and then downloads the checksum file and archive assets from the resolved release tag URL.

Archive filename templates may include `{version}` for this resolver.

Example asset layout:

```text
VERSION
checksums.txt
rellog_v0.1.2_linux_x86_64.tar.gz
rellog_v0.1.2_darwin_aarch64.tar.gz
```

### `latest_asset`

Use `latest_asset` when releases provide versionless archive asset names and latest installs can download directly from GitHub's latest release asset URL.

Each release must provide:

```text
checksums.txt
<versionless archive assets>
```

The generated installer does not resolve the actual latest release tag for latest installs. It downloads the checksum file and archive asset directly from `/releases/latest/download/<asset>`.

Archive filename templates must not include `{version}` for this resolver.

Example asset layout:

```text
checksums.txt
rellog_linux_x86_64.tar.gz
rellog_darwin_aarch64.tar.gz
```

## Checksum Contract

The checksum file is expected to contain SHA-256 digests in this form:

```text
<sha256>  <filename>
```

The filename must exactly match the archive asset filename generated from the config. The generated installer uses exact filename equality for lookup. It does not treat the filename as a regex, glob, or shell pattern.

Checksum verification is mandatory before installation.

Checksum verification detects download corruption and inconsistencies among release assets. It does not prove maintainer identity, release asset authenticity, supply-chain provenance, or immutability of an already-published GitHub Release asset.

## Config Examples

These examples show the generator core config produced from form input. They are not the primary user input surface, and none of them contain a `defaults.version` field.

### `release_version_file`

```json
{
  "owner": "tooppoo",
  "repo": "rellog",
  "binary": {
    "name": "rellog",
    "pathInArchive": "rellog"
  },
  "versionResolver": {
    "type": "release_version_file",
    "fileName": "VERSION"
  },
  "archive": {
    "format": "tar.gz",
    "nameTemplate": "{repo}_{version}_{os}_{arch}.tar.gz"
  },
  "checksum": {
    "fileName": "checksums.txt",
    "algorithm": "sha256"
  },
  "targets": [
    { "os": "linux", "arch": "x86_64" },
    { "os": "darwin", "arch": "aarch64" }
  ],
  "defaults": {
    "installDir": "$HOME/.local/bin"
  }
}
```

### `latest_asset`

```json
{
  "owner": "tooppoo",
  "repo": "rellog",
  "binary": {
    "name": "rellog",
    "pathInArchive": "rellog"
  },
  "versionResolver": {
    "type": "latest_asset"
  },
  "archive": {
    "format": "tar.gz",
    "nameTemplate": "{repo}_{os}_{arch}.tar.gz"
  },
  "checksum": {
    "fileName": "checksums.txt",
    "algorithm": "sha256"
  },
  "targets": [
    { "os": "linux", "arch": "x86_64" },
    { "os": "darwin", "arch": "aarch64" }
  ],
  "defaults": {
    "installDir": "$HOME/.local/bin"
  }
}
```

### `zip` variant

Either resolver can use `archive.format = "zip"`. Compared to the examples above, only the archive section changes:

```json
"archive": {
  "format": "zip",
  "nameTemplate": "{repo}_{version}_{os}_{arch}.zip"
}
```

A `zip` config produces an installer that requires `unzip` at runtime instead of `tar`, and the `nameTemplate` must end with `.zip`. For `latest_asset`, the template must still omit `{version}` (for example `{repo}_{os}_{arch}.zip`).

## Detailed Runtime Behavior

This document intentionally describes the minimum contract. Detailed runtime behavior, resolver semantics, URL encoding policy, extraction policy, and binary placement rules are documented in [`docs/generated-installer-runtime.md`](https://github.com/tooppoo/installerer/blob/main/docs/generated-installer-runtime.md).
