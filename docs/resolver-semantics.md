# Resolver Semantics And Release Contract

This document is the detailed companion to [`docs/installer-contract.md`](./installer-contract.md). It describes resolver-specific latest/pinned install semantics, the network access boundary, reproducibility differences between latest and pinned installs, and the guarantees and limits of checksum verification.

`docs/installer-contract.md` states the minimum contract: project scope, the responsibility boundary between the SPA and the generated installer, the minimal per-resolver release asset layout, and a minimal description of the checksum contract, with a reference to generated installer runtime docs.

This document does not restate that minimum contract. It focuses on the parts that matter for operational decisions: which URLs a generated installer can reach, how reproducible a latest install actually is, and what checksum verification does and does not prove.

## Relationship To Other Documents

- [`docs/installer-contract.md`](./installer-contract.md) is the minimal, user-facing contract. Read it first.
- `docs/resolver-semantics.md` (this document) is the detailed explanation of resolver semantics and release contract referenced from the installer contract.
- [`docs/generated-installer-runtime.md`](./generated-installer-runtime.md) describes runtime mechanics of the generated `install.sh`: argument parsing, URL encoding, checksum lookup implementation, archive extraction, and binary placement. This document references that runtime detail where relevant but does not redefine command policy or extraction mechanics.

## installerer's Position

`installerer` is a browser SPA that generates an `install.sh` script.

- The SPA does not depend on the GitHub API, a backend, or credentials.
- The SPA does not perform external communication. It does not call `fetch()` or `XMLHttpRequest` against any external endpoint, does not live-validate the target repository or its release assets, and does not fetch, generate, place, or manage a version file asset.
- POSIX `sh` generation, downloading, checksum verification, and version file resolution are all responsibilities of the **generated installer**, not the SPA.

The generated installer is a single `install.sh` script. Its internals are organized as:

- `main` — parses arguments and dispatches
- `install_latest` — runs when `--version` is omitted
- `install_pin` — runs when `--version <version>` is provided

`--version latest` is rejected as invalid input; it is not treated as a latest install. There is no `defaults.version` field in the JSON config — version selection is a runtime argument, not a generation-time default.

## Representative Names vs. Configured Values

This document uses `VERSION` and `checksums.txt` as representative example names for readability. They are not fixed names.

- The version file asset name (for `release_version_file`) is whatever `versionResolver.fileName` is configured to.
- The checksum file asset name is whatever `checksum.fileName` is configured to.

Wherever this document writes `VERSION`, read it as "the asset named by `versionResolver.fileName`." Wherever it writes `checksums.txt`, read it as "the asset named by `checksum.fileName`."

## Resolver Semantics

### `release_version_file`

- On latest install, the generated installer downloads the version file asset (`versionResolver.fileName`, represented here as `VERSION`) from the GitHub Release `latest/download` URL.
- The version file's content is treated as the actual release tag. Archive filename templates for this resolver may include `{version}`.
- Once the version file is resolved, checksum file and archive asset downloads use the resolved release tag as a tag-specific URL.
- On pinned install (`--version <version>`), the given value is used directly as the release tag. The version file asset is never fetched for a pinned install.
- The SPA itself never fetches the version file asset. Only the generated installer does, at install time. Whether the version file's content actually matches the release tag it names is the responsibility of the release pipeline, not the generated installer or the SPA.

### `latest_asset`

- On latest install, the generated installer does not resolve an actual release tag. It downloads assets directly from `/releases/latest/download/<asset>`.
- Archive filename templates for this resolver must not include `{version}`; both latest and pinned installs assume a versionless archive filename.
- On pinned install (`--version <version>`), the given value is used as the release tag in a tag-specific download URL, same as `release_version_file`.

## Checksum Contract

The checksum file has the form:

```text
<sha256>  <filename>
```

`checksums.txt` above is a representative name; the actual asset name is `checksum.fileName`.

- The filename field must exactly match the archive asset filename. There is no partial match, glob match, or "first line" fallback.
- Checksum verification is mandatory and always runs before archive extraction.
- On checksum mismatch, the generated installer does not perform archive extraction or binary placement.

MVP checksum verification confirms that the downloaded archive matches the checksum file obtained per the resolver semantics above. When a tag-specific URL is used, this is a same-release consistency check between the archive and its checksum file.

For `latest_asset` latest installs, the checksum file and archive asset are fetched as two separate requests to `/releases/latest/download/...`. If the latest release changes between those two requests, the two files can come from different releases, which the installer detects as a checksum mismatch (or, less commonly, a download failure), not as a distinct "race" error class of its own.

Checksum verification detects download corruption and inconsistency between the fetched archive and the fetched checksum file. It does not prove maintainer identity, release asset authenticity, or supply-chain provenance. See [Non-Goals](./generated-installer-runtime.md#non-goals) in the generated installer runtime doc for related items the MVP intentionally does not cover (cosign, SBOM, provenance).

## Latest / Pinned Reproducibility

- A latest install (no `--version`) resolves against whatever GitHub currently considers the latest release at install time. The resolved release tag can differ between two invocations if the upstream latest release changes in between.
- A pinned install (`--version <version>`) always targets an explicit release tag, so it is more reproducible than a latest install.
- `--version latest` is rejected as invalid input; it is not an alias for a latest install.
- The MVP does not embed an expected checksum inside the generated installer itself. Reproducibility claims here are about _which release is targeted_, not about the immutability of a GitHub Release asset after it is published.

### `release_version_file` latest install reproducibility

The latest install first fetches the version file asset from the latest release, then treats its content as the actual release tag. From that point on, the checksum file and archive asset are fetched from that resolved, tag-specific URL. So after version file resolution, the remaining download path is pinned to one release tag for the rest of that install run, even though the initial version file fetch used the `latest/download` URL.

### `latest_asset` latest install race

Both the checksum file and the archive asset are fetched via `/releases/latest/download/...`, with no intermediate step that pins them to one release tag. If the upstream latest release changes between those two fetches, the installer has no way to detect this except via the resulting checksum mismatch, and it does not attempt to resolve this atomically in the MVP. When this happens, the generated installer stops with a clear error.

If a more reproducible latest install is required, use `release_version_file`, since its version file resolution step pins the rest of the install to one tag.

## Network Access Boundary

Every URL path segment (`owner`, `repo`, resolved or pinned version, and asset filenames) is percent-encoded as its own path segment; a complete URL is never encoded as one opaque string. See [`docs/generated-installer-runtime.md`](./generated-installer-runtime.md#url-generation-and-encoding) for the encoding mechanics.

### `release_version_file` latest install

```text
https://github.com/{owner}/{repo}/releases/latest/download/{versionResolver.fileName}
https://github.com/{owner}/{repo}/releases/download/{resolved_version}/{checksum.fileName}
https://github.com/{owner}/{repo}/releases/download/{resolved_version}/{archive_asset_name}
```

### `release_version_file` pinned install

```text
https://github.com/{owner}/{repo}/releases/download/{pinned_version}/{checksum.fileName}
https://github.com/{owner}/{repo}/releases/download/{pinned_version}/{archive_asset_name}
```

### `latest_asset` latest install

```text
https://github.com/{owner}/{repo}/releases/latest/download/{checksum.fileName}
https://github.com/{owner}/{repo}/releases/latest/download/{archive_asset_name}
```

### `latest_asset` pinned install

```text
https://github.com/{owner}/{repo}/releases/download/{pinned_version}/{checksum.fileName}
https://github.com/{owner}/{repo}/releases/download/{pinned_version}/{archive_asset_name}
```

### Prohibited Network Access

The generated installer never accesses:

- the GitHub API, including `api.github.com`
- `raw.githubusercontent.com`
- `gist.githubusercontent.com`
- a user-provided arbitrary URL
- an unrestricted URL pass-through (for example, accepting any `^https?://...` value)
- any URL other than a GitHub Release asset URL for the configured repository

The SPA never performs:

- GitHub API, backend, or token-dependent network requests
- browser-side `fetch()` calls to an external endpoint
- `XMLHttpRequest` calls to an external endpoint
- live validation of the target repository or its release assets

## JSON Config Examples

These examples show the shape of the generator core config as built from form input. They are for understanding the generated JSON preview, not for direct hand-authoring — the form is the primary input surface. Neither example includes a `defaults.version` field, because that field does not exist in this config.

### `release_version_file`

```json
{
  "owner": "example-org",
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
    "nameTemplate": "rellog_{version}_{os}_{arch}.tar.gz"
  },
  "checksum": {
    "fileName": "checksums.txt",
    "algorithm": "sha256"
  },
  "targets": [
    { "os": "linux", "arch": "x86_64" },
    { "os": "darwin", "arch": "arm64" }
  ],
  "defaults": {
    "installDir": "$HOME/.local/bin"
  }
}
```

### `latest_asset`

```json
{
  "owner": "example-org",
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
    "nameTemplate": "rellog_{os}_{arch}.tar.gz"
  },
  "checksum": {
    "fileName": "checksums.txt",
    "algorithm": "sha256"
  },
  "targets": [
    { "os": "linux", "arch": "x86_64" },
    { "os": "darwin", "arch": "arm64" }
  ],
  "defaults": {
    "installDir": "$HOME/.local/bin"
  }
}
```

## Non-Goals

This document does not cover:

- general package manager usage
- the full GitHub Actions release pipeline specification
- signature verification setup
- cosign verification setup
- SBOM or provenance setup
- runtime dependency or command policy detail (see [`docs/generated-installer-runtime.md`](./generated-installer-runtime.md))
- GitHub or backend fetches performed at UI runtime (there are none)
- live validation of a repository or its release assets
