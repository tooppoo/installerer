# Installer Contract

This document defines the minimum contract assumed by `installerer` and by the installer scripts it generates.

`installerer` is a browser-based installer generator. It generates an `install.sh` script for GitHub Release assets. It is not a package manager, release pipeline, signing system, or GitHub API client.

Read this document first. The detailed latest/pinned install semantics live in [the install semantics document](./install-semantics.md), and the runtime mechanics of the generated script live in [the generated installer runtime document](./generated-installer-runtime.md).

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

The generated installer script performs all runtime work: target detection, release-tag resolution, download, checksum verification, archive extraction, and binary placement.

## Generated Installer Boundary

The generated installer is a single POSIX `sh` script named `install.sh`.

Running it without `--version` installs the latest release. Running it with `--version <version>` installs that pinned release tag. `--version latest` is rejected because latest installs are represented by omitting `--version`.

Version selection belongs to the generated installer's runtime interface, not to the generator config. There is no `defaults.version` field.

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

This is independent of runtime architecture detection: the generated installer always canonicalizes `uname -s`/`uname -m` output to `linux`/`darwin` and `x86_64`/`aarch64` first, then looks up the configured label for that OS/architecture pair. Changing `architectureLabels` changes only the asset name spelling, never which hosts the installer recognizes. See [the two-stage target detection description](./generated-installer-runtime.md#target-detection-and-architecture-label-resolution) for the resolution this implies.

### Archive format and archive filename template are independent

Archive format and archive filename template shape are independent choices. Either format can be used with or without `{version}` in the template.

Changing the archive format or `{version}` usage does not automatically rewrite the archive filename template. The template must be updated explicitly when its suffix or `{version}` usage no longer matches the selected options.

## Runtime Dependencies

The generated artifact is a POSIX `sh` script, but it depends on documented external commands.

See [the runtime dependencies reference](../reference/runtime-dependencies.md) for the generated, authoritative list of required commands. It is derived from the same typed dependency definitions the generated installer's `--requirements` / `--check-requirements` options use.

If any required command is missing, the generated installer stops with a clear error.

## Release Asset Layout

Latest install behavior is decided entirely by whether `archive.nameTemplate` contains `{version}` (zero or one occurrences only — two or more is rejected at generation time). There is no separate resolver concept to select.

Below, `checksums.txt` is a representative example name, not a fixed name. The actual asset name comes from the config: `checksum.fileName`. See [the install semantics document](./install-semantics.md) for the full latest/pinned install semantics.

### With `{version}`

Use a template containing `{version}` when latest installs should resolve to an actual release tag.

Each release must provide:

```text
checksums.txt
<archive assets>
```

There is no separate version file asset. On a latest install, the generated installer uses the latest release's checksum file as a version-resolution index to discover the release tag, then downloads from the resolved tag. See [the `{version}` template semantics](./install-semantics.md#archive-templates-with-version) for the resolution algorithm and its validation rules.

Each release's asset names must be unique per target under this resolution — if two assets both match one target's archive name pattern, the latest install fails as ambiguous.

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

Checksum verification detects download corruption and inconsistencies among release assets. It does not prove maintainer identity, release asset authenticity, supply-chain provenance, or immutability of an already-published GitHub Release asset. See [the checksum verification guarantees and limits](./install-semantics.md#checksum-contract) for what verification runs against in each install mode.

## Detailed Runtime Behavior

This document intentionally describes the minimum contract.

Latest/pinned install semantics, the network access boundary, reproducibility, and the guarantees and limits of checksum verification are documented in [the install semantics document](./install-semantics.md), including the offline "expected release tag check" the Web UI offers for `{version}` templates.

Runtime mechanics such as argument parsing, URL encoding policy, extraction policy, and binary placement rules are documented in [the generated installer runtime document](./generated-installer-runtime.md).
