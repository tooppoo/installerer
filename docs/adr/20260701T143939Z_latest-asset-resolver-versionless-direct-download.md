# latest_asset Resolver Does Not Resolve the Latest Release Tag And Fetches Versionless Assets Directly

- Status: Superseded by [20260707T022251Z_template-driven-latest-install-tag-resolution.md](./20260707T022251Z_template-driven-latest-install-tag-resolution.md)
- Created: 2026-07-01T14:39:39Z

## Context

`installerer` generates install scripts for CLI binaries published as GitHub Release assets. The single-artifact runtime with internal `install_latest` and `install_pin` functions is recorded in [Generated Installer Runtime Is A Single POSIX Sh Script](20260630T174038Z_generated-installer-runtime-single-posix-sh.md).

The `release_version_file` resolver supports a latest install by fetching a `VERSION` asset from `latest/download`, reading it as a release tag, and then downloading versioned assets from that resolved tag.

Some projects prefer a simpler release layout: they publish a checksum file and versionless archive assets, and rely on GitHub's own `latest/download` redirect instead of shipping a `VERSION` asset. For that layout, resolving a concrete release tag on the client is unnecessary work and adds an extra asset to publish.

This ADR records the `latest_asset` resolver behavior from [Issue #7](https://github.com/tooppoo/installerer/issues/7). It needs to be an ADR because it defines a resolver contract — where URLs come from, what is and is not resolved, and the consistency guarantees — that other resolvers and future work must not silently break.

## Decision

The `latest_asset` resolver is generated into the same single `install.sh` runtime and reuses the shared download, checksum, extraction, and placement code. Only URL and archive filename generation differ.

- The browser app (SPA) does not fetch Release assets and does not resolve a latest release tag. Resolver behavior is entirely a runtime responsibility of the generated installer. The SPA only emits the installer from JSON input.
- `latest_asset` does not resolve a latest release tag during a latest install. `install_latest` fetches the checksum file and the archive asset directly from `https://github.com/<owner>/<repo>/releases/latest/download/<asset>`.
- The archive filename is rendered from a versionless template for both latest and pinned installs. Because no release tag is available to expand, an `archive.nameTemplate` containing `{version}` is rejected at generation time as a hard error.
- The install source is logged as `latest`. No resolved version is logged for a latest install.
- A pinned install (`--version <version>`) dispatches to `install_pin`, validates the version as a Git tag name using the runtime helper that mirrors checking `refs/tags/<version>` as a Git refname (no dependency on the `git` command), percent-encodes the version as a single URL path segment, and downloads from `https://github.com/<owner>/<repo>/releases/download/<encoded version>/<asset>`.
- `--version latest` is rejected as an invalid pinned version rather than treated as a latest install. This rejection matches the exact lowercase string `latest` only; `Latest` and `LATEST` are left to Git tag validation and GitHub Release URL resolution.
- The release tag (pinned install only), the archive asset filename, and the checksum filename are each percent-encoded as separate URL path segments. The full URL is never encoded as one string. The URL-encoded version is never used as part of the archive filename, and checksum lookup matches the raw archive asset filename, not the URL-encoded one.
- The generated installer never calls the GitHub API and never reads anything other than GitHub Release assets.

OK templates:

```text
{repo}_{os}_{arch}.tar.gz
{bin}_{target}.tar.gz
```

NG template (rejected at generation time):

```text
{repo}_{version}_{os}_{arch}.tar.gz
```

Because the latest install fetches the checksum file and the archive with two separate requests to `latest/download`, a latest release that changes between the two requests can yield a checksum file and an archive from different releases. This is treated as a checksum mismatch and stops with a hard error. `latest_asset` deliberately does not provide atomic latest-to-tag pinning.

JSON config has no `defaults.version` field; version selection belongs to installer invocation.

## Alternatives Considered

### Resolve The Latest Release Tag Client-Side For `latest_asset`

The installer could follow the `/releases/latest` redirect (or a similar mechanism) to discover the concrete release tag, then download versioned assets from that tag. This would make the latest install atomic against release changes and would allow logging the resolved version. It requires redirect URL parsing or GitHub API access and reintroduces version resolution that this resolver exists to avoid. Projects that need atomic latest resolution can use `release_version_file` instead. Not selected.

### Allow `{version}` In `latest_asset` Archive Templates

Allowing `{version}` would require a resolved release tag to expand the archive filename, which `latest_asset` does not have during a latest install. Silently substituting an empty or placeholder version would generate wrong asset names. Rejecting `{version}` at generation time makes the constraint explicit and fails fast. Not selected.

### Case-Insensitive Rejection Of `latest`

`--version` could reject `latest` case-insensitively. The ambiguity being avoided is only the exact lowercase `latest` that the interface uses to mean "omit `--version`". `Latest` and `LATEST` are ordinary strings that Git tag validation and GitHub Release URL resolution can handle without special-casing. Rejecting only the exact lowercase form keeps the special case minimal. Not selected.

## Consequences

### Positive Consequences

- Supports a simple release layout that publishes versionless assets and a checksum file without a `VERSION` asset.
- Fetches the latest asset without the GitHub API and without resolving a release tag.
- Restricting archive filenames to versionless templates makes asset names deterministic without knowing the latest tag.
- Checksum verification still catches a checksum file and archive that come from different releases, turning a mid-install release change into a hard error rather than a silent mismatch.

### Negative Consequences

- The latest install is not atomic: a release change between the checksum and archive requests aborts the install instead of pinning to one tag.
- A latest install cannot log or pin the concrete release tag; callers who need that must use `release_version_file`.

### Neutral Consequences

- `latest` installs remain inherently moving targets, consistent with the shared runtime.
- `latest_asset` and `release_version_file` share all runtime code except URL and archive filename generation.
