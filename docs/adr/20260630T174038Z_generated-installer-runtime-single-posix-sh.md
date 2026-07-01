# Generated Installer Runtime Is A Single POSIX Sh Script With Internal Latest And Pinned Functions

- Status: Accepted
- Created: 2026-06-30T17:40:38Z

## Context

`installerer` generates install scripts for CLI binaries published as GitHub Release assets.

The generated installer needs shared runtime behavior for argument parsing, target detection, download, checksum verification, archive extraction, and binary placement. Resolver-specific behavior should remain isolated to URL and archive filename generation.

This ADR records the runtime design from [Issue #5](https://github.com/tooppoo/installerer/issues/5).

## Decision

The generated installer artifact is a single `install.sh`. It is not split into latest-only and pinned-only artifacts.

The public installer interface is one POSIX `sh` script. Internally, the generated runtime separates resolver behavior into:

- `main`
- `install_latest`
- `install_pin`

`main` owns argument parsing and dispatch. If `--version` is omitted, it dispatches to `install_latest`. If `--version <version>` is present, it dispatches to `install_pin`. `--version latest` is rejected because it is ambiguous; latest install is represented by omitting `--version`.

JSON config does not contain `defaults.version`. Version selection belongs to installer invocation, not config defaults.

The generated installer is POSIX `sh`, but it may require documented external runtime commands. Those dependencies and extraction command policy are recorded in [Generated Installer Runtime](../generated-installer-runtime.md).

URL path segment encoding is implemented by a runtime helper that performs byte-wise percent encoding. Release tags, archive filenames, checksum filenames, and version filenames are encoded as separate path segments.

Remote asset names and local temporary paths are separated. The runtime downloads archives to fixed temporary paths rather than appending asset names to temporary directories.

Archive extraction targets only `binary.pathInArchive`. The runtime rejects empty, absolute, directory, backslash, and dot-segment paths before extraction. After extraction, the install target must be a non-symlink regular file.

Binary placement copies to `installDir/.<binary>.tmp.$$`, applies executable permission, then moves that temporary file to `installDir/<binary>`.

## Alternatives Considered

### Separate Latest And Pinned Installer Artifacts

Separate artifacts would reduce branching inside each installer, but they would duplicate configuration values and distribution assets. Users would also need to choose between multiple installer files. This is not selected.

### A Single Function For Latest And Pinned Installs

A single install function could share more lines of shell, but resolver semantics for latest and pinned installs differ. Separate internal functions make the URL generation boundary clearer.

### POSIX Sh With No External Commands

Implementing downloads, checksum verification, archive extraction, and byte-wise encoding without external commands is impractical and less safe. The runtime instead uses POSIX `sh` plus documented commands.

### Full Archive Safety Audit

The runtime could inspect every archive entry for path traversal and other unsafe paths. The MVP extracts only the exact configured binary entry and rejects unsafe install targets. Full archive audit is deferred.

## Consequences

### Positive Consequences

- Users get the conventional single `install.sh` interface.
- Resolver-specific latest and pinned behavior stays separated in implementation.
- Config does not blur latest install and pinned install semantics with a default version.
- Runtime dependencies are explicit and testable.
- URL encoding and shell quoting rules are localized.
- Remote filenames do not become local filesystem paths.
- Targeted extraction reduces exposure to unrelated archive entries.
- Temporary-file placement reduces the chance of breaking an existing binary during failed installs.

### Negative Consequences

- The generated script is larger than a minimal installer.
- Runtime behavior depends on common system commands beyond POSIX `sh`.
- The MVP does not fully audit every archive entry.

### Neutral Consequences

- `latest` installs remain inherently moving targets.
- Pinned installs depend on the release assets and checksum file remaining available and consistent.
