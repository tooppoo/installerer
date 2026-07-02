# Generated Installer Runtime E2E Uses A Local Fixture Server And A Test-Only URL Base Seam

- Status: Accepted
- Created: 2026-07-02T05:01:21Z

## Context

The generated installer performs download, checksum verification, archive extraction, binary placement, and failure handling at runtime. Unit tests, snapshots, and the static assertions from [Fixture-Driven Integration Tests](20260701T230740Z_fixture-driven-installer-generation-tests.md) verify what the generator emits, but not whether the emitted script actually behaves correctly when executed. That ADR explicitly deferred runtime e2e as separate future work; [Issue #13](https://github.com/tooppoo/installerer/issues/13) is that work.

Two constraints shape the design:

- Runtime e2e must not depend on real GitHub Releases. External state, network availability, and GitHub-side behavior would make the tests non-deterministic.
- Making the installer testable must not weaken its network boundary. Introducing a user-facing base URL override, external manifest URL, or arbitrary URL pass-through into the JSON config would trade test convenience for a production hole.

This is an ADR because it fixes how the runtime boundary is verified and where the test seam is allowed to live — a rule future test work must not silently break.

## Decision

- Runtime e2e tests run the generated installer as a real `sh` process with real `curl`, `tar`, `unzip`, and `sha256sum`, downloading from a local fixture HTTP server. No real GitHub Release, no GitHub API.
- The fixture server accepts the same URL path shape as GitHub Release downloads (`/{owner}/{repo}/releases/latest/download/{asset}` and `/{owner}/{repo}/releases/download/{version}/{asset}`) and records every request in a request log.
- The test-only URL base seam is confined to the test harness: the harness takes the unmodified production `generateInstaller` output and rewrites its GitHub Release base URL to the fixture server as a test-build transformation. The rewrite asserts the exact number of known URL constructions and that no GitHub reference survives, so a test run cannot silently fall through to the real network.
- `src/` and the user-facing JSON config must not gain a base URL override, test URL, external manifest URL, or arbitrary URL pass-through. The pre-rewrite script is checked against the shared static assertions in every e2e run to verify this.
- Fixture configs use configured asset names that differ from the representative examples (`versionResolver.fileName = "LATEST_VERSION"`, `checksum.fileName = "SHA256SUMS"`), so a runtime that hard-codes `VERSION` or `checksums.txt` fails the suite.
- The request log is asserted as an exact, ordered list per resolver and mode: `release_version_file` latest requests version file → checksum file → archive; pinned installs never request the version file; `latest_asset` never requests a version file in either mode; no other requests occur.
- Successful installs verify binary placement in the (default `$HOME/.local/bin`) install dir, content equality with the fixture archive entry, and the executable permission. Failure paths (checksum mismatch, missing checksum row, missing binary in archive) verify that extraction and placement do not happen and that an existing installed binary is preserved.
- Temporary-directory cleanup is verified on both success and failure by pointing `TMPDIR` at a test-owned parent and asserting it is empty afterwards.
- Unsupported OS / arch / target detection is simulated with a `uname` PATH shim, so the suite does not depend on the CI host and supported-target runs are pinned to `linux/x86_64`.
- The checksum file is downloaded before the archive, so the request order matches the documented resolver semantics and a missing checksum file fails before the (potentially large) archive download.

## Alternatives Considered

### File-based download function replacement

Stubbing the download function (or `curl`) to read local files avoids HTTP entirely. Rejected as the primary mechanism because it bypasses exactly what needs verification: real URL construction, the request path a server observes, and HTTP failure handling. The existing stub-`curl` dispatch harness remains for fast URL-construction checks, but runtime behavior verification uses the fixture server.

### User-facing base URL override in JSON config

A `baseUrl` config field would make testing trivial and is how some installer generators work. Rejected: it would let a generated installer download from arbitrary hosts, destroying the GitHub-Release-only network boundary that the contract documents and the static assertions enforce.

### Real GitHub Release e2e

Highest fidelity, including TLS and redirect behavior. Rejected for the MVP: non-deterministic, externally mutable, rate-limited, and requiring release maintenance in a separate repository. Reproducing GitHub domain/TLS/redirect behavior is explicitly out of scope for the fixture server.

## Consequences

### Positive Consequences

- Download, checksum verification, extraction, placement, failure handling, and cleanup are verified by executing the real generated script, catching regressions that snapshots and static assertions cannot (the suite immediately found a `detect_target` failure that did not propagate its exit code).
- The network boundary is observable as behavior: the request log proves which URLs a generated installer actually touches per resolver and mode.
- Deterministic tests: no external state, network dependency, or CI-host OS/arch dependency.
- The production installer text remains byte-identical to what users get; the seam cannot leak because it does not exist outside the harness.

### Negative Consequences

- The harness carries more infrastructure: an HTTP server, archive builders, a `uname` shim, and per-run environments.
- The base URL rewrite depends on the generator's known URL construction count and needs updating if URL assembly is redesigned.
- Real GitHub domain, TLS, and redirect behavior remain unverified by design.

### Neutral Consequences

- Signal-interruption cleanup, exhaustive runtime-dependency-missing cases, and archive failure pattern coverage stay out of scope, per the issue.
- The suite runs `sh` with the host's POSIX shell; shell implementation differences across platforms are not enumerated.
