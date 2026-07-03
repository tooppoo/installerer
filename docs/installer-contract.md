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
- does not fetch, generate, place, or manage a version file asset (represented as `VERSION` below; the actual asset name is `versionResolver.fileName`)
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

## Archive Format Contract

The generator core supports two archive formats, selectable as `archive.format` in the browser form:

- `tar.gz`
- `zip`

The archive format determines an archive-format-specific runtime dependency of the generated installer:

- `archive.format = "tar.gz"` requires `tar` at runtime
- `archive.format = "zip"` requires `unzip` at runtime

The `archive.nameTemplate` must end with the suffix matching the selected format (`.tar.gz` or `.zip`).

`archive.osCase` controls how the `{os}` and `{target}` placeholders render the detected OS name:

- `lowercase` (default): `linux`, `darwin`
- `capitalized`: `Linux`, `Darwin`

This only changes display casing of the supported `linux`/`darwin` targets; it does not add Windows as a target OS.

`architectureLabels` controls how the `{arch}` and `{target}` placeholders render the detected architecture. It maps each canonical architecture the generated installer detects at runtime (`x86_64`, `aarch64`) to the label embedded in Release asset names:

- default (when omitted): `x86_64 -> x86_64`, `aarch64 -> aarch64` (the OS-reported architecture name)
- also selectable in the browser form as presets: `x86_64 -> amd64`, `aarch64 -> arm64` (the Go `GOARCH` convention used by tools such as goreleaser)
- or any custom label, for example `x86_64 -> x64`, `aarch64 -> arm64-v8a`

This is independent of runtime architecture detection: the generated installer always canonicalizes `uname -m` output to `x86_64`/`aarch64` first, then looks up the configured label. Changing `architectureLabels` changes only the asset name spelling, never which host architectures the installer recognizes. See [`generated-installer-runtime.md`](./generated-installer-runtime.md#target-detection-and-architecture-label-resolution) for the two-stage resolution this implies.

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

Below, `VERSION` and `checksums.txt` are representative example names, not fixed names. The actual asset names come from the config: the version file asset is `versionResolver.fileName`, and the checksum file asset is `checksum.fileName`. See [`docs/resolver-semantics.md`](https://github.com/tooppoo/installerer/blob/main/docs/resolver-semantics.md) for the full distinction and resolver semantics.

### `release_version_file`

Use `release_version_file` when latest installs should resolve to an actual release tag.

Each release must provide:

```text
VERSION
checksums.txt
<archive assets>
```

The version file asset (`versionResolver.fileName`, represented above as `VERSION`) must contain the release tag name as a single line. The generated installer downloads this asset from the latest release URL, reads it as the resolved release tag, and then downloads the checksum file and archive assets from the resolved release tag URL.

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

### Archive format and version resolver

Archive format and version resolver are independent choices.

Any supported resolver can use either `tar.gz` or `zip`.

The archive filename pattern must satisfy both selected options:

Changing the archive format or resolver does not automatically rewrite the archive filename pattern. The pattern must be updated explicitly when its suffix or `{version}` usage no longer matches the selected options.

## Detailed Runtime Behavior

This document intentionally describes the minimum contract.

Resolver semantics, the network access boundary, latest/pinned install reproducibility, and the guarantees and limits of checksum verification are documented in [`resolver-semantics.md`](./resolver-semantics.md).

Runtime mechanics such as argument parsing, URL encoding policy, extraction policy, and binary placement rules are documented in [`generated-installer-runtime.md`](./generated-installer-runtime.md).
