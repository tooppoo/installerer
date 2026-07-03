# Generated Installer Embeds A Whitelisted Effective-Config Metadata Comment

- Status: Accepted
- Created: 2026-07-03T08:27:13Z

## Context

The generated `install.sh` previously carried only a static disclaimer header; nothing in the artifact identified which owner/repo/resolver/archive/target options it was generated from. When a user reports an issue against a generated installer, or reviews one before running it, there was no way to recover that from the script itself without going back to the browser form.

[Issue #74](https://github.com/tooppoo/installerer/issues/74) asked for a human-readable summary of the _effective config_ — the validated/normalized `InstallerConfig` that `generateInstaller` actually receives, not the raw UI form state — embedded as a shell comment near the top of the script.

The design has to hold a hard line: this comment is metadata for humans, not a second config channel. Several existing guarantees would be at risk if the comment implementation were sloppy:

- The static assertions in [Fixture-Driven Integration Tests](20260701T230740Z_fixture-driven-installer-generation-tests.md) treat comment lines as non-executable and exclude them from network-boundary and runtime-logic scans; a new comment block has to keep satisfying that split.
- A config value is user-controlled data (by way of the browser form) flowing into a shell comment. A value containing a raw newline could terminate the comment line and let the remainder execute as shell.
- Dumping the raw config object (or including non-deterministic fields like a timestamp or commit hash) would turn a review aid into either a security leak surface or a reproducibility hazard.

This is an ADR because it fixes a rule future config-field additions must keep following, not just a one-off rendering choice.

## Decision

- A dedicated section renderer, `renderMetadataComment` in `src/generatedInstaller/sections/metadataComment.ts`, builds the comment from an explicit field whitelist — never `JSON.stringify(config)` or any other full-object dump.
- The whitelist is exactly the fields listed in the issue: `generator.name`, `generator.sourceUrl` (both static), `owner`, `repo`, `binary.name`, `binary.pathInArchive`, `versionResolver.type`, `versionResolver.fileName` (only when the resolver is `release_version_file`), `archive.format`, `archive.nameTemplate`, `archive.osCase`, `checksum.fileName`, `checksum.algorithm`, `defaults.installDir`, and `targets` (rendered as `os/arch` pairs in the normalized config order).
- `renderHeader()` (`src/generatedInstaller/sections/header.ts`) no longer states the generator name and source URL itself. Those two facts now have a single source of truth — the metadata comment's `generator.name`/`generator.sourceUrl` fields — instead of being duplicated across two independently maintained comment blocks that could drift apart after a future edit to either one.
- `composeInstallerScript` inserts `renderMetadataComment(context)` between `renderHeader()` and `renderConstants(context)`. The comment documents the generated script; runtime behavior continues to come only from the constants and functions that follow it.
- Every whitelisted value is rendered as a single comment line. Control characters (including `\n` and `\r`) are escaped to a visible `\xHH`/`\n`/`\r`/`\t` representation before being written, so no config value can terminate a `#` line and turn the remainder of that line into executable shell.
- No timestamp, commit hash, generation-time clock value, or other non-deterministic field is included. The same normalized config always produces the same metadata comment.
- Fields outside the current `InstallerConfig` shape (profile, explicit-override flags, signature policy/backend/weakening, generated timestamp) are explicitly out of scope here and are only to be whitelisted once the corresponding config lands.

## Alternatives Considered

### Dump the full validated config as JSON in a comment

Simpler to implement and trivially complete. Rejected: it would silently surface every future config field (including ones added specifically to _not_ be exposed, such as a future signature backend or token-bearing setting) without a deliberate whitelist decision, and it invites parsers to treat the comment as a stable machine-readable API.

### Emit the metadata as an env-var-style block the installer itself reads back

Would make the comment doubly useful (both human-readable and validable at runtime). Rejected: it would make the comment part of the runtime contract, contradicting the issue's explicit requirement that "the installer does not parse the comment" and that runtime behavior is decided solely by the generated shell code.

### Include a generation timestamp or commit hash

Would improve traceability for support requests. Rejected for this issue: it breaks reproducibility (the same config would no longer produce byte-identical output), which conflicts with the snapshot-testing contract in [Fixture-Driven Integration Tests](20260701T230740Z_fixture-driven-installer-generation-tests.md). Left as a candidate for an explicit future opt-in.

## Consequences

### Positive Consequences

- Generated installers are self-describing: reviewing or filing an issue about an `install.sh` no longer requires reconstructing the config from the browser form.
- The whitelist forces every future config field to make an explicit, reviewable decision about comment exposure instead of leaking by default.
- Byte-for-byte reproducibility is preserved: the same effective config always renders the same comment, keeping the existing snapshot tests meaningful.

### Negative Consequences

- Adding a new `InstallerConfig` field now carries an extra step (deciding whether and how it appears in the whitelist) that is easy to forget.
- Two existing test helpers needed small updates to keep excluding comment lines from logic-only scans (`assertRuntimeStructure`'s casing guard) and to account for the `https://github.com` occurrence contributed by `generator.sourceUrl` (`rewriteBaseUrlForTest`'s URL-construction count).

### Neutral Consequences

- `generator.version` is not emitted; the issue allows it only if the generator core can reference it deterministically, which is not yet the case.
- Security-relevant fields (profile, signature policy/backend/weakening) remain unaddressed by the whitelist until those configs exist, per the issue's explicit out-of-scope list.
