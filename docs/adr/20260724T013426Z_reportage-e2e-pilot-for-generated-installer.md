# Reportage e2e Pilot for the Generated Installer Runtime

- Status: Accepted
- Created: 2026-07-24T01:34:26Z

## Context

The generated installer's runtime e2e coverage lives in [`packages/core/test/e2e/generatedInstallerRuntime.e2e.test.ts`](../../packages/core/test/e2e/generatedInstallerRuntime.e2e.test.ts).
Its strategy is recorded in [the runtime e2e ADR](20260702T050121Z_runtime-e2e-local-fixture-server-and-test-only-url-base-seam.md):
generate the script in-process, rewrite its base URL through a test-only seam, and serve fixtures from a local HTTP server.

[reportage](https://github.com/tooppoo/reportage) is a shell-oriented e2e runner whose `.repor` scenarios describe actions and assertions declaratively, with per-case isolated workspaces and PATH-overlay command shims.
Whether it can express this repository's installer e2e — and at what fidelity cost — is an open question that a survey alone could not settle, because several behaviors (shim resolution inside child processes, shell-script `exec` targets, exact-order request evidence) needed to be observed against a real installer run.

This ADR records the pilot's shape so that the coexistence of two e2e runners, and the criteria for expanding or abandoning the second one, are a committed decision rather than an accident of the working tree.

## Decision

Run a deliberately small reportage pilot alongside the existing Bun e2e:

- Port exactly three representative cases of the with-version tar.gz flow — latest install success, pinned install success, and the no-index-candidate failure — to [`packages/core/test/e2e/generatedInstallerRuntime.repor`](../../packages/core/test/e2e/generatedInstallerRuntime.repor).
  The Bun e2e must keep running unchanged during the pilot; the `.repor` suite is additive evidence, not a replacement.
- The system under test is the committed snapshot [`packages/core/test/snapshots/with-version-tar-gz.install.sh`](../../packages/core/test/snapshots/with-version-tar-gz.install.sh), not a freshly generated script.
  The snapshot cannot silently drift from the generator because the snapshot-match integration test regenerates and compares it; the `.repor` cases therefore assert against the snapshot's real configuration values (`tooppoo/rellog`, `checksums.txt`, linux/x86_64 asset label `x64`).
- Network behavior is replaced by registered command shims under [`packages/core/test/e2e/shims/`](../../packages/core/test/e2e/shims/), wired in [`reportage.kdl`](../../reportage.kdl):
  `curl` appends each requested URL to a workspace-local `curl.log` (asserted byte-exact and in order) and serves files from a workspace-local `served/` mirror of the GitHub URL path; `uname` pins the target to linux/x86_64; `installer` is an executable wrapper delegating to the intentionally non-executable snapshot.
  No test may perform real network access.
- The suite is Linux-only by design and may assume GNU coreutils; there is no BSD fallback.
- The suite runs through `just e2e-reportage`, which must refuse to run against any reportage version other than the pinned one (`REPORTAGE_VERSION` in the `Justfile`), because reportage is pre-1.0 and minor releases may change DSL or config semantics.
  CI provisions the pinned version via `scripts/dev/setup-reportage.sh` and runs the recipe as a dedicated step; the recipe stays out of `_check` so hosts without reportage still pass `just check`.
- Behavior the pilot cannot express stays in the Bun e2e: generating scripts from many configs dynamically, real curl/HTTP fidelity, and the production-script static contract assertions.

Expansion beyond the three cases, or replacement of the Bun e2e, requires a follow-up decision that weighs the pilot's observed fidelity and maintenance cost; abandoning the pilot means removing the `.repor` suite, the shims, `reportage.kdl`, and the Justfile/CI wiring together.

## Alternatives Considered

### Port the Bun e2e wholesale to reportage

Rejected for now: the Bun e2e derives scripts from in-process config permutations and asserts a static production contract, which `.repor` scenarios cannot express without generating scenario files from TypeScript — a build step that would outweigh the pilot's purpose of assessing fidelity cheaply.

### Reuse the Bun fixture HTTP server and only swap the runner

Rejected: reportage cases run isolated `sh` processes, so an in-process `Bun.serve` fixture server would have to become a separately managed daemon with port coordination.
The curl shim keeps the fixture surface inside each case's workspace and additionally yields byte-exact, ordered request evidence for free.

### Generate a fresh installer script per run instead of using the snapshot

Rejected: it would re-introduce a generation step and the test-only URL seam into an environment whose value is exercising the committed artifact as-is; the snapshot-match integration test already guarantees the snapshot equals current generator output.

## Consequences

### Positive Consequences

- The installer runtime contract is now exercised by a second, declarative harness whose cases read as documentation (`document` blocks) and produce machine-readable run evidence.
- Request-order and tmp-cleanup guarantees are asserted byte-exact, matching the Bun e2e's strength.
- CI fails loudly if the snapshot's messages, URLs, or filename template change in a way that breaks the ported cases, instead of the `.repor` suite rotting unobserved.

### Negative Consequences

- Two e2e harnesses cover overlapping behavior; until the follow-up decision, changes to the with-version tar.gz flow may need edits in both.
- The version pin means reportage upgrades are a deliberate chore (bump `REPORTAGE_VERSION` in the `Justfile` and `scripts/dev/setup-reportage.sh`, refresh the version-matched docs cache, re-verify the suite).

### Neutral Consequences

- The pilot asserts against the snapshot's real config values rather than the Bun e2e's synthetic fixture config; conclusions are equivalent, values differ.
- reportage run artifacts land under `.reportage/` in the invocation directory, which is git-ignored.
