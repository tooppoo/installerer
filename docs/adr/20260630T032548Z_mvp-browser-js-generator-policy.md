# MVP Browser JS Installer Generator Policy

- Status: Accepted
- Created: 2026-06-30T03:25:48Z

## Context

`installerer` generates installers for multiple CLI tools whose release artifacts are published as GitHub Release assets.

For the MVP, the project will be implemented as a browser-based JavaScript generator rather than a CLI generator. The generator itself must not depend on the GitHub API, GitHub authentication, or a backend service.

The generated installer should follow the proven structure and runtime behavior of `tooppoo/git-kura`'s `install.sh` where practical. The MVP intentionally narrows the verification model to checksum verification and excludes cosign verification.

This decision records the MVP policy from [Issue #2](https://github.com/tooppoo/installerer/issues/2) so later implementation issues can stay within the same scope.

## Decision

The MVP generator must be implemented as browser JavaScript.

The generator input must be JSON. The generator must not call the GitHub REST API, GraphQL API, or any other backend API to validate repository state. It must not accept, store, transmit, or otherwise handle GitHub tokens or other authentication credentials.

The generator must not validate whether `owner/repo` exists at generation time. It may display a generated `curl` command to help a human check for typos, but that command is UI assistance only and must not be part of the generated installer's runtime behavior.

The generated installer must be POSIX `sh`. Its basic structure and runtime behavior should follow `tooppoo/git-kura`'s `install.sh`, including:

- `DEBUG=1` shell tracing
- temporary directory creation with `mktemp -d`
- `trap` cleanup for temporary directory removal
- a shared `fail` helper for consistent error exits
- an installer settings block for repository, program, release, and output directory values
- POSIX shell and bash compatibility checks
- OS and architecture detection
- rejection of unsupported targets
- GitHub Release asset downloads with `curl` or an equivalent tool
- archive extraction
- binary placement
- executable permission setup
- checksum verification

The generated installer must only perform network access against GitHub Release assets for the configured repository. It must not call the GitHub API, read GitHub Pages, fetch raw files, use external manifests, or rely on package managers at runtime.

Checksum verification is required. The generated installer must verify that the downloaded archive matches a checksum recorded in the checksum file from the same release.

Cosign verification, signature verification, SBOM validation, and supply-chain provenance checks are not part of the MVP and must not be generated.

Only these resolver modes are supported in the MVP:

- `release_version_file`
- `latest_asset`

The generator must not implement `redirect_tag`, `git ls-remote` latest resolution, or other resolver modes in the MVP.

## Resolver Semantics

`release_version_file` should be used when the generated installer needs to resolve the actual latest release tag without using the GitHub API.

For latest installs, `release_version_file` may fetch a version file from:

```txt
https://github.com/<owner>/<repo>/releases/latest/download/<version-file>
```

It may then fetch the release checksum file and archive from:

```txt
https://github.com/<owner>/<repo>/releases/download/<version>/<checksums-file>
https://github.com/<owner>/<repo>/releases/download/<version>/<archive>
```

`latest_asset` should be used when latest installs do not need to resolve the actual release tag. Latest installs with `latest_asset` may fetch:

```txt
https://github.com/<owner>/<repo>/releases/latest/download/<checksums-file>
https://github.com/<owner>/<repo>/releases/latest/download/<archive>
```

Pinned installs with `latest_asset` may fetch:

```txt
https://github.com/<owner>/<repo>/releases/download/<version>/<checksums-file>
https://github.com/<owner>/<repo>/releases/download/<version>/<archive>
```

Because `latest_asset` does not resolve the latest release tag at install time, it assumes versionless archive filenames for latest installs. If a release archive filename includes the release tag or version, the configuration should use `release_version_file`.

## Checksum Guarantee

The MVP checksum verification guarantees only that the downloaded archive matches the checksum file published in the same release.

This can detect download corruption and mismatches between release assets. It does not guarantee maintainer identity, release asset authenticity, immutable release contents, signature validity, SBOM integrity, or supply-chain provenance.

The MVP does not embed expected checksums in generated installers.

## Latest And Pinned Versions

`latest` installs are not reproducible because GitHub's latest release target can change over time.

Pinned version installs are more reproducible than `latest` installs because they target an explicit release tag. However, because the MVP does not embed expected checksums, pinned installs still depend on the release assets remaining unchanged.

## Non-Goals

The MVP does not include:

- GitHub REST API or GraphQL API usage
- GitHub token or credential handling
- live `owner/repo` validation
- live release asset validation during generation
- runtime dependency on GitHub Pages, raw files, or external manifests
- `redirect_tag` resolver support
- `git ls-remote` latest resolution
- package manager integration
- cosign verification
- signature verification
- SBOM validation
- provenance validation

## Implementation Issues

The MVP implementation is expected to be completed through these follow-up issues:

- [#3](https://github.com/tooppoo/installerer/issues/3)
- [#4](https://github.com/tooppoo/installerer/issues/4)
- [#5](https://github.com/tooppoo/installerer/issues/5)
- [#6](https://github.com/tooppoo/installerer/issues/6)
- [#7](https://github.com/tooppoo/installerer/issues/7)
- [#8](https://github.com/tooppoo/installerer/issues/8)
- [#9](https://github.com/tooppoo/installerer/issues/9)
- [#10](https://github.com/tooppoo/installerer/issues/10)

When those implementation issues are complete, the MVP should be usable as a browser JavaScript installer generator within the boundaries recorded in this ADR.

## Alternatives Considered

### CLI Generator

A CLI generator could validate more state locally and integrate more naturally with developer workflows. It is not selected for the MVP because the initial product direction is a browser JavaScript generator with no backend dependency.

### GitHub API Validation

The generator could call the GitHub API to validate repositories, releases, and assets before producing an installer. This is not selected because the MVP must avoid GitHub API dependency and authentication handling.

### Cosign Verification

The generated installer could include cosign verification. This is not selected for the MVP because the first supported verification boundary is checksum verification only.

### External Manifest Based Resolution

The installer could use GitHub Pages, raw files, or another external manifest to resolve versions and assets. This is not selected because runtime network access must remain limited to GitHub Release assets.

## Consequences

### Positive Consequences

- The MVP has a small, browser-friendly implementation boundary.
- Generated installers can be used without GitHub credentials.
- The runtime network policy is narrow and auditable.
- Checksum verification is always present in generated installers.
- Future issues have a stable policy for resolver behavior and non-goals.

### Negative Consequences

- The generator cannot confirm repository or asset existence before generation.
- `latest` installs are inherently not reproducible.
- Pinned installs are not fully immutable because expected checksums are not embedded.
- The MVP does not provide maintainer identity, signature, SBOM, or provenance guarantees.

### Neutral Consequences

- Human-facing typo checks may be presented as generated commands outside installer runtime.
- Versioned archive filenames require `release_version_file`; `latest_asset` assumes versionless latest asset names.
