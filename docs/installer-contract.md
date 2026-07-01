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

## Generated Installer Boundary

The generated installer is a single POSIX `sh` script named `install.sh`.

The script contains a small runtime with separate latest and pinned install paths:

- `main` parses arguments and dispatches
- `install_latest` runs when `--version` is omitted
- `install_pin` runs when `--version <version>` is provided

`--version latest` is rejected because latest installs are represented by omitting `--version`.

Version selection belongs to the generated installer's runtime interface, not to the generator config.

The generated installer does not:

- call the GitHub API
- access non-GitHub-Release URLs
- perform cosign verification in the MVP
- verify SBOMs or provenance in the MVP
- generate a Windows-native installer

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
- `tar`

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

These examples show the generator core config produced from form input. They are not the primary user input surface.

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

## Detailed Runtime Behavior

This document intentionally describes the minimum contract. Detailed runtime behavior, resolver semantics, URL encoding policy, extraction policy, and binary placement rules are documented in [`docs/generated-installer-runtime.md`](https://github.com/tooppoo/installerer/blob/main/docs/generated-installer-runtime.md).
