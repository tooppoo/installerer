# Installer Contract

This document defines the minimum contract assumed by `installerer` and by the installer scripts it generates.

`installerer` is a browser-based installer generator. It generates an `install.sh` script for GitHub Release assets. It is not a package manager, release pipeline, signing system, or GitHub API client.

## Scope

`installerer` targets projects that publish installable CLI archives as GitHub Release assets.

The generated installer assumes that each supported release follows the asset layout described below, keyed on whether `archive.nameTemplate` contains `{version}`.

The browser app itself:

- does not call the GitHub API
- does not call a backend
- does not require authentication or tokens
- does not fetch Release assets
- does not fetch, generate, place, or manage any release asset — there is no `VERSION` asset in this contract
- does not verify checksums at generation time

The generated installer script performs runtime work such as target detection, release-tag resolution, download, checksum verification, archive extraction, and binary placement.

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

`architectureLabels` controls how the `{arch}` and `{target}` placeholders render the detected architecture. It maps each canonical architecture the generated installer detects at runtime (`x86_64`, `aarch64`) to the label embedded in Release asset names, and accepts two forms:

- flat (one mapping shared by every target OS): `{ "x86_64": "amd64", "aarch64": "arm64" }`
- per OS (one mapping per target OS, for projects whose Linux and macOS assets spell the same architecture differently): `{ "linux": { "x86_64": "x86_64", "aarch64": "aarch64" }, "darwin": { "x86_64": "amd64", "aarch64": "arm64" } }`

Mixing OS keys and architecture keys in one object is rejected. In either form, omitted keys fall back to the default label:

- default (when omitted): `x86_64 -> x86_64`, `aarch64 -> aarch64` (the OS-reported architecture name)
- also selectable in the browser form as presets: `x86_64 -> amd64`, `aarch64 -> arm64` (the Go `GOARCH` convention used by tools such as goreleaser)
- or any custom label, for example `x86_64 -> x64`, `aarch64 -> arm64-v8a`

This is independent of runtime architecture detection: the generated installer always canonicalizes `uname -s`/`uname -m` output to `linux`/`darwin` and `x86_64`/`aarch64` first, then looks up the configured label for that OS/architecture pair. Changing `architectureLabels` changes only the asset name spelling, never which hosts the installer recognizes. See [`generated-installer-runtime.md`](./generated-installer-runtime.md#target-detection-and-architecture-label-resolution) for the two-stage resolution this implies.

## Runtime Dependencies

The generated artifact is a POSIX `sh` script, but it depends on documented external commands.

See [`docs/runtime-dependencies.md`](./runtime-dependencies.md) for the generated, authoritative list of required commands. It is derived from the same typed dependency definitions the generated installer's `--requirements` / `--check-requirements` options use.

If any required command is missing, the generated installer should stop with a clear error.

## Archive Filename Templates And Latest Install Behavior

`installerer` has no resolver concept to select. Latest install behavior is decided entirely by whether `archive.nameTemplate` contains `{version}` (zero or one occurrences only — two or more is rejected at generation time).

Below, `checksums.txt` is a representative example name, not a fixed name. The actual asset name comes from the config: `checksum.fileName`. See [`docs/resolver-semantics.md`](https://github.com/tooppoo/installerer/blob/main/docs/resolver-semantics.md) for the full latest/pinned install semantics.

### With `{version}`

Use a template containing `{version}` when latest installs should resolve to an actual release tag.

Each release must provide:

```text
checksums.txt
<archive assets>
```

There is no separate version file asset. The generated installer downloads the checksum file from the latest release URL and uses it as a version-resolution index: it scans the filename column for the one entry matching this target's archive name pattern (literal prefix/suffix around `{version}`, never a regex or glob), extracts the substring in between as the candidate release tag, validates it as a Git tag that is also safe as a filename component (no `/`, `\`, whitespace, or control characters), then downloads the checksum file and archive assets again from the resolved release tag URL.

Each release's asset names must be unique per target under this prefix/suffix scan — if two assets both match one target's pattern, the latest install fails as ambiguous.

Example asset layout:

```text
checksums.txt
rellog_v0.1.2_linux_x86_64.tar.gz
rellog_v0.1.2_darwin_aarch64.tar.gz
```

### Without `{version}`

Use a versionless template when releases provide versionless archive asset names and latest installs can download directly from GitHub's latest release asset URL.

Each release must provide:

```text
checksums.txt
<versionless archive assets>
```

The generated installer does not resolve the actual latest release tag for latest installs. It downloads the checksum file and archive asset directly from `/releases/latest/download/<asset>`.

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

### Archive format and archive filename template

Archive format and archive filename template shape are independent choices.

Either can use either `tar.gz` or `zip`, with or without `{version}`.

The archive filename pattern must satisfy both selected options:

Changing the archive format or `{version}` usage does not automatically rewrite the archive filename pattern. The pattern must be updated explicitly when its suffix or `{version}` usage no longer matches the selected options.

## Detailed Runtime Behavior

This document intentionally describes the minimum contract.

Latest/pinned install semantics, the network access boundary, reproducibility, and the guarantees and limits of checksum verification are documented in [`resolver-semantics.md`](./resolver-semantics.md), including the offline "expected release tag check" the Web UI offers for `{version}` templates.

Runtime mechanics such as argument parsing, URL encoding policy, extraction policy, and binary placement rules are documented in [`generated-installer-runtime.md`](./generated-installer-runtime.md).
