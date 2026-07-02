# Fixture-Driven Integration Tests Are The Backbone Of Installer Generation Testing

- Status: Accepted
- Created: 2026-07-01T23:07:40Z

## Context

`installerer` is a browser-based generator that turns a JSON config into a POSIX `sh` installer. The MVP explicitly excludes runtime e2e tests against real GitHub Releases, fixture HTTP servers, and OS-matrix installer execution.

At the same time, the following need regression protection for safety and contract conformance:

- strict JSON validation
- archive filename template expansion
- dependency-aware contextual validation
- resolver semantics
- URL path segment encoding
- shell safety of the generated installer
- generated checksum verification
- absence of GitHub API, raw/gist content URLs, and network access outside GitHub Release assets
- absence of cosign verification in the MVP

[Issue #10](https://github.com/tooppoo/installerer/issues/10) originally enumerated a broad list of test points. Closing it by covering every item as an individual unit test would make the MVP disproportionately heavy. The main value of `installerer` is not the correctness of each helper in isolation, but that user input produces a safe, contract-conforming generated installer. The test strategy therefore needs to center on something close to the generator's end-to-end path.

## Decision

Issue #10 is closed by fixture-driven integration tests, not by exhaustive unit tests.

### Fixtures

Fixtures are inputs to the whole generator and live under `test/fixtures/`.

Representative valid fixtures cover the resolver × archive-format matrix:

- `release_version_file` + `tar.gz`
- `release_version_file` + `zip`
- `latest_asset` + `tar.gz`
- `latest_asset` + `zip`

Valid fixtures run through generation to the generated-installer snapshot and static assertions.

Invalid fixtures are classified by user-visible failure reason, not by internal module:

- `schema`
- `template`
- `contextual-validation`
- `resolver`
- `archive-format`
- `path-filename-safety`

Invalid fixtures verify that generation fails and that errors carry the expected classification, field path, and reason. Each invalid fixture file embeds its own `expectedErrors`.

### Snapshots

Generated installer snapshots live under `test/snapshots/` as plain `*.install.sh` files so diffs read as shell script changes. They are the regression detector for the generated-installer contract, not a log of internal implementation.

Snapshots must be updated only when code generation changes intentionally, via `bun run test:update-snapshots`, and the diff must be reviewed. Changes that do not alter the generated installer output contract — validation error messages, UI, docs, fixture classification, internal refactors — must not update snapshots.

Snapshots are normalized to LF newlines, no trailing whitespace, and exactly one final newline. No meaning-changing rewrite is applied. The generator output contains no timestamps or random values and is deterministic in section order.

### Static assertions

Prohibitions and structural requirements are checked by static assertions in `test/helpers/staticAssertions.ts`, because snapshot review alone can miss them. The checks include: no shell `eval`, no cosign verification, checksum verification present, `main` / `install_latest` / `install_pin` present, `--version` dispatch, exact-lowercase `latest` rejection, remote asset name and local temporary path separation, no bare-operand use of the archive asset name, exact-match checksum lookup, format-specific extraction and dependency checks, and clear errors on missing runtime dependencies.

Static assertions are string/regex/lightweight scans over the generator's known output structure. They must not grow into general shell parsing or arbitrary-script data-flow analysis.

### Network boundary

SPA / generator runtime code and the generated installer have separate network boundary tests.

Runtime code (`src/`, excluding tests and the build-time docs module in `src/generated/`) must not contain external communication APIs — detected with identifier-boundary patterns such as `\bfetch\s*\(` and `\bXMLHttpRequest\b` — nor `api.github.com`, `raw.githubusercontent.com`, `gist.githubusercontent.com`, nor URLs outside `https://github.com/`. Comments are stripped before scanning so documentation URLs are excluded. Docs, help text, and examples are not subject to the API detection.

The generated installer legitimately accesses GitHub Release assets, so URL checks use an allowlist instead of blanket rejection: the only allowed base is `https://github.com/`, and network paths are limited to `/releases/latest/download/` or `/releases/download/`. Because URLs are assembled from shell variables, the tests check both that forbidden domains are absent and that emitted URL construction fragments only form Release asset URLs.

### Pure helper unit tests

Unit tests are limited to places where an integration failure would be hard to localize: URL path segment encoding, the template parser, and the `VERSION` content parser. These already exist in `src/*.test.ts` and stay.

### Runtime dispatch harness

Generated installers are additionally executed as real `sh` processes with a stub `curl` on `PATH` (`test/integration/generatedInstallerRuntime.test.ts`). This observes dispatch, URL construction, and `--version latest` rejection without any network access, and stays within the MVP boundary: no fixture HTTP server, no real GitHub Release, no OS matrix.

## Alternatives Considered

### Exhaustive unit tests per helper

Rejected. It makes the issue-close condition disproportionately heavy for the MVP, and individually correct helpers still do not guarantee a safe, contract-conforming generated installer. The primary object under test is the input-to-output generation result.

### Runtime e2e tests in the MVP

Rejected. Fixture HTTP servers, real GitHub Releases, and OS-matrix execution are already MVP non-goals; they are heavy, unstable, and would grow test infrastructure ahead of the minimal browser generator. Checksum-mismatch and real-download verification belong to a separate issue.

### Snapshot tests only

Rejected. Injections such as `eval`, GitHub API calls, raw/gist content URLs, or cosign verification could slip through human snapshot review. Prohibitions are stronger as machine-checkable static assertions; snapshots are kept for reviewing structural change.

## Consequences

### Positive Consequences

- Tests center on the generator integration path that matches actual user value.
- Contract-breaking changes to the generated installer are easier to detect than with unit-test coverage alone.
- Snapshots make generated-installer structure changes explicitly reviewable.
- Static assertions catch forbidden constructs that snapshot review could miss.
- The SPA and generated-installer network boundaries are no longer conflated.

### Negative Consequences

- Detection granularity for individual helper behavior is coarser than exhaustive unit testing.
- Snapshot updates require human review judgment.
- Static assertions depend on the generator's output structure and need updating on a major generator redesign.
- Environment differences, external command behavior, and integration with real GitHub Releases remain outside MVP detection.

### Neutral Consequences

- Runtime e2e, fixture-server, and real-Release tests remain separate future work.
