# Latest/Pinned Install Semantics And Release Contract

This document is the detailed companion to [`docs/installer-contract.md`](./installer-contract.md). It describes latest/pinned install semantics, the network access boundary, reproducibility differences between latest and pinned installs, and the guarantees and limits of checksum verification.

`docs/installer-contract.md` states the minimum contract: project scope, the responsibility boundary between the SPA and the generated installer, the minimal release asset layout, and a minimal description of the checksum contract, with a reference to generated installer runtime docs.

This document does not restate that minimum contract. It focuses on the parts that matter for operational decisions: which URLs a generated installer can reach, how reproducible a latest install actually is, and what checksum verification does and does not prove.

## Relationship To Other Documents

- [`docs/installer-contract.md`](./installer-contract.md) is the minimal, user-facing contract. Read it first.
- `docs/resolver-semantics.md` (this document) is the detailed explanation of latest/pinned install semantics and release contract referenced from the installer contract.
- [`docs/generated-installer-runtime.md`](./generated-installer-runtime.md) describes runtime mechanics of the generated `install.sh`: argument parsing, URL encoding, checksum lookup implementation, archive extraction, and binary placement. This document references that runtime detail where relevant but does not redefine command policy or extraction mechanics.

## installerer's Position

`installerer` is a browser SPA that generates an `install.sh` script.

- The SPA does not depend on the GitHub API, a backend, or credentials.
- The SPA does not perform external communication. It does not call `fetch()` or `XMLHttpRequest` against any external endpoint, does not live-validate the target repository or its release assets, and does not fetch, generate, place, or manage any release asset — including no `VERSION` asset.
- POSIX `sh` generation, downloading, checksum verification, and release-tag resolution are all responsibilities of the **generated installer**, not the SPA.

The generated installer is a single `install.sh` script. Its internals are organized as:

- `main` — parses arguments and dispatches
- `install_latest` — runs when `--version` is omitted
- `install_pin` — runs when `--version <version>` is provided

`--version latest` is rejected as invalid input; it is not treated as a latest install. There is no `defaults.version` field in the JSON config — version selection is a runtime argument, not a generation-time default.

## Representative Names vs. Configured Values

This document uses `checksums.txt` as a representative example name for readability. It is not a fixed name — the checksum file asset name is whatever `checksum.fileName` is configured to.

Wherever this document writes `checksums.txt`, read it as "the asset named by `checksum.fileName`."

## Latest Install Semantics

Whether a latest install resolves an actual release tag is decided entirely by whether `archive.nameTemplate` contains `{version}` — there is no separate resolver concept to configure, and releases never need to publish a `VERSION` asset.

`{version}` may occur zero or one times in `archive.nameTemplate`; two or more occurrences is rejected at generation time.

### Archive templates with `{version}`

- On latest install, the generated installer first downloads the checksum file (`checksum.fileName`) from the GitHub Release `latest/download` URL, and uses it purely as a version-resolution **index** — not yet as the checksum verification source.
- It expands every placeholder except `{version}` for the detected target, producing a literal prefix and suffix around where `{version}` sits in the template, then scans the index's filename column for the one entry starting with that prefix and ending with that suffix, using literal string matching only (never a regex or glob).
- Zero matches, or two-or-more distinct matches, is a hard error.
- The substring between the prefix and suffix becomes the candidate release tag. It must be a valid Git tag, and it must not contain `/`, `\`, whitespace, or control characters — a tag containing `/` can be a valid Git tag but is rejected here, since it cannot round-trip safely as an archive filename component. (`--version` pinning still accepts such tags directly, since pinning percent-encodes the tag into a URL path segment instead of embedding it in a filename.)
- Once resolved, the checksum file and archive asset are re-downloaded from the resolved tag's tag-specific URL, and it is this tag-specific checksum file — not the index copy — that verification runs against.
- On pinned install (`--version <version>`), the given value is used directly as the release tag. The checksum-index scan never runs for a pinned install.
- The SPA itself never fetches the checksum file or scans it. Only the generated installer does, at install time. A separate offline, pure function (`checkExpectedReleaseTag`, exported from `@installerer/core/expectedReleaseTag`) mirrors the same prefix/suffix algorithm so the Web UI can check a pasted checksum file or archive filename against the configured template — this never fetches GitHub and never confirms the release actually exists.

### Archive templates without `{version}`

- On latest install, the generated installer does not resolve an actual release tag. It downloads assets directly from `/releases/latest/download/<asset>`.
- On pinned install (`--version <version>`), the given value is used as the release tag in a tag-specific download URL, same as a `{version}` template.

## Checksum Contract

The checksum file has the form:

```text
<sha256>  <filename>
```

`checksums.txt` above is a representative name; the actual asset name is `checksum.fileName`.

- The filename field must exactly match the archive asset filename. There is no partial match, glob match, or "first line" fallback.
- Checksum verification is mandatory and always runs before archive extraction, against the tag-specific checksum file (for a `{version}` template) or the directly-fetched checksum file (for a versionless template) — never against the checksum-index copy used only for tag resolution.
- On checksum mismatch, the generated installer does not perform archive extraction or binary placement.

MVP checksum verification confirms that the downloaded archive matches the checksum file obtained per the install semantics above. When a tag-specific URL is used, this is a same-release consistency check between the archive and its checksum file.

For a versionless template's latest install, the checksum file and archive asset are fetched as two separate requests to `/releases/latest/download/...`. If the latest release changes between those two requests, the two files can come from different releases, which the installer detects as a checksum mismatch (or, less commonly, a download failure), not as a distinct "race" error class of its own.

Checksum verification detects download corruption and inconsistency between the fetched archive and the fetched checksum file. It does not prove maintainer identity, release asset authenticity, or supply-chain provenance. See [Non-Goals](./generated-installer-runtime.md#non-goals) in the generated installer runtime doc for related items the MVP intentionally does not cover (cosign, SBOM, provenance).

## Latest / Pinned Reproducibility

- A latest install (no `--version`) resolves against whatever GitHub currently considers the latest release at install time. The resolved release tag can differ between two invocations if the upstream latest release changes in between.
- A pinned install (`--version <version>`) always targets an explicit release tag, so it is more reproducible than a latest install.
- `--version latest` is rejected as invalid input; it is not an alias for a latest install.
- The MVP does not embed an expected checksum inside the generated installer itself. Reproducibility claims here are about _which release is targeted_, not about the immutability of a GitHub Release asset after it is published.

### `{version}` template latest install reproducibility

The latest install first fetches the checksum file from the latest release as a version-resolution index, then treats the extracted, matching filename's substring as the actual release tag. From that point on, the checksum file and archive asset are re-fetched from that resolved, tag-specific URL. So after the index scan, the remaining download path is pinned to one release tag for the rest of that install run, even though the initial index fetch used the `latest/download` URL — the index fetch itself is still an unpinned race window (see below), just a shorter one than the whole install.

### Versionless template latest install race

Both the checksum file and the archive asset are fetched via `/releases/latest/download/...`, with no intermediate step that pins them to one release tag. If the upstream latest release changes between those two fetches, the installer has no way to detect this except via the resulting checksum mismatch, and it does not attempt to resolve this atomically in the MVP. When this happens, the generated installer stops with a clear error.

If a more reproducible latest install is required, use an `archive.nameTemplate` containing `{version}`, since its checksum-index resolution step pins the rest of the install to one tag after the index fetch.

## Expected Release Tag Check (Offline)

For a `{version}` archive template, the Web UI offers an "Expected release tag check" panel that runs the same prefix/suffix extraction and validation the generated installer performs, entirely offline:

- It never fetches GitHub or any other network endpoint.
- It accepts either a pasted checksum file's text (scanned the same way as the runtime index scan) or a single observed archive filename.
- On success it reports the expected release tag and the matched archive asset name; it does not confirm that release or asset actually exists on GitHub.
- The same algorithm is exposed as a pure function (`checkExpectedReleaseTag` in `@installerer/core/expectedReleaseTag`) so a future CLI command can reuse it without duplicating the logic.

## Network Access Boundary

Every URL path segment (`owner`, `repo`, resolved or pinned version, and asset filenames) is percent-encoded as its own path segment; a complete URL is never encoded as one opaque string. See [`docs/generated-installer-runtime.md`](./generated-installer-runtime.md#url-generation-and-encoding) for the encoding mechanics.

### `{version}` template latest install

```text
https://github.com/{owner}/{repo}/releases/latest/download/{checksum.fileName}
https://github.com/{owner}/{repo}/releases/download/{resolved_version}/{checksum.fileName}
https://github.com/{owner}/{repo}/releases/download/{resolved_version}/{archive_asset_name}
```

### Versionless template latest install

```text
https://github.com/{owner}/{repo}/releases/latest/download/{checksum.fileName}
https://github.com/{owner}/{repo}/releases/latest/download/{archive_asset_name}
```

### Pinned install (either template shape)

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

### `archive.nameTemplate` with `{version}`

```json
{
  "owner": "example-org",
  "repo": "rellog",
  "binary": {
    "name": "rellog",
    "pathInArchive": "rellog"
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
    { "os": "darwin", "arch": "aarch64" }
  ],
  "defaults": {
    "installDir": "$HOME/.local/bin"
  }
}
```

### `archive.nameTemplate` without `{version}`

```json
{
  "owner": "example-org",
  "repo": "rellog",
  "binary": {
    "name": "rellog",
    "pathInArchive": "rellog"
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
    { "os": "darwin", "arch": "aarch64" }
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
