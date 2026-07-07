# archive.nameTemplate's {version} Presence Replaces versionResolver

- Status: Accepted
- Created: 2026-07-07T02:22:51Z

## Context

`installerer` previously required a `versionResolver` config field (`release_version_file` | `latest_asset`) to decide latest-install behavior. `release_version_file` additionally required the release pipeline to publish a `VERSION` asset containing the resolved tag as a single line, fetched from `latest/download` before the real download could begin.

Whether `archive.nameTemplate` contains `{version}` already fully determines which of these two behaviors a project needs: a template with `{version}` needs an actual resolved tag to expand; a versionless template does not. `versionResolver` was therefore duplicate, independently-settable state that could disagree with the template shape, and `release_version_file` required an extra published asset purely to carry information the checksum file's own contents (the archive filenames it lists) already implies.

This ADR is required because it changes the JSON config schema (a breaking change — `versionResolver` is removed, not deprecated), changes the generated installer's network/URL contract for `{version}` templates (3 requests instead of 2, and the requests target different assets), and establishes a durable project rule ("no resolver concept, ever") that future contributors would otherwise be tempted to reintroduce.

Two decisions from the issue discussion narrow the design further:

- Release tags containing `/` are unsupported specifically for this `{version}`-extraction path, even though `--version` pinning still accepts them directly (pinning percent-encodes the tag into a URL path segment; extraction embeds a candidate substring into a filename component, where `/` cannot round-trip).
- The Web UI's diagnostic check for this feature must stay strictly offline: it never fetches GitHub, and it never claims to confirm that a release or asset actually exists.

## Decision

- `versionResolver` is removed from the config schema entirely (JSON and any future KDL codec). Supplying it is rejected as an unknown field, with no migration path.
- `archive.nameTemplate`'s `{version}` placeholder may occur zero or one times; two or more occurrences is a generation-time hard error.
- Latest-install behavior is decided solely by whether `{version}` is present:
  - **With `{version}`:** `install_latest` fetches `checksum.fileName` from `/releases/latest/download/...` and uses it purely as a version-resolution index (not yet the checksum-verification source). It expands every placeholder except `{version}` for the detected target into a literal prefix and suffix, then scans the index's filename column for the one entry matching `prefix...suffix` via **literal string matching only** (never a regex or glob). Zero matches or two-or-more distinct matches is a hard error. The substring between prefix and suffix is the candidate release tag; it must pass Git tag validation **and** must not contain `/`, `\`, whitespace, or control characters. On success, the checksum file and archive asset are re-downloaded from that tag's tag-specific URL, and verification runs against this tag-specific checksum file — never the index copy. This is 3 total requests: index checksum, tag-specific checksum, tag-specific archive.
  - **Without `{version}`:** unchanged direct 2-request `/releases/latest/download/...` flow for both checksum and archive, with no resolved version.
  - Pinned installs (`--version <tag>`) are unaffected by `{version}` presence; they always use the tag-specific URL directly.
- The `VERSION` asset, `VERSION_FILE_NAME`, and `read_version_file` are removed entirely from the generated installer. No release ever needs to publish a version file asset.
- A new pure, offline core function, `checkExpectedReleaseTag` (`packages/core/src/expectedReleaseTag.ts`, exported as `@installerer/core/expectedReleaseTag`), re-implements the identical prefix/suffix extraction and validation algorithm for the Web UI's "expected release tag check" panel. It accepts a pasted checksum-file text or a single observed archive filename, never fetches anything, and is structured to be reusable from a future CLI command without duplicating the algorithm.

## Alternatives Considered

### Keep The Two-Resolver Model, Just Rename It

Renaming `release_version_file`/`latest_asset` to something clearer would not remove the duplication between the resolver field and the template's own `{version}` usage, and would not remove the need to publish a `VERSION` asset. Not selected.

### Support Tags Containing `/` In The Extraction Path

A tag containing `/` (e.g. `release/v1.2.3`) is a valid Git tag and is already supported by `--version` pinning via percent-encoding. Supporting it in the checksum-index extraction path would require either an escaping convention for archive filenames (adding complexity with no known concrete demand) or accepting an ambiguous filename/tag boundary. Rejecting `/`-containing extracted tags keeps the feature simple; it is not a capability loss for pinning, only a boundary of this specific auto-detection path. Not selected for the initial version; revisit if a concrete, frequent use case emerges.

### Resolve The Latest Tag Via The GitHub API Or Redirect Parsing

Both would need either GitHub API access (against the project's no-API-access rule) or fragile redirect-following behavior. The checksum-index scan achieves the same outcome (an atomic tag resolution before the real download) using only GitHub Release asset URLs the installer already needs to fetch. Not selected.

## Consequences

### Positive Consequences

- Releases never need to publish a `VERSION` (or any other version-only) asset; the checksum file's own contents carry enough information.
- Config schema has one fewer independently-settable field that could disagree with `archive.nameTemplate`.
- The same tag-extraction algorithm is expressed once (`expectedReleaseTag.ts` for the pure/offline case, mirrored once in generated POSIX `sh`), and is directly checkable by users through the Web UI without any network access.

### Negative Consequences

- Breaking change: any config JSON containing `versionResolver` is now rejected outright, with no automatic migration.
- A `{version}` template's latest install now makes one more network request during the index-fetch phase compared to a versionless template's latest install (3 vs. 2), though this matches the old `release_version_file` resolver's request count (version-file fetch + tag fetch was already 2 requests before the final archive fetch).
- Release maintainers using `{version}` templates must ensure each target's archive filename is uniquely identifiable by the prefix/suffix scan; an ambiguous release layout (two assets matching one target's pattern) is a new possible install-time failure mode.

### Neutral Consequences

- Tags containing `/` remain valid for `--version` pinning; they are only unsupported for the new checksum-index extraction path specifically.
- The offline "expected release tag check" is diagnostic only — it never confirms actual release/asset existence, matching the SPA's existing no-network-access design principle.
