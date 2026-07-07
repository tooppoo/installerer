# Config Diagnostics Model And Pure CLI Formatter

- Status: Accepted
- Created: 2026-07-07T17:00:17Z

## Context

#99 decided that KDL config parse / codec / semantic validation errors are
reported as KDL-facing diagnostics. #90 (`validate`) and #89 (`generate`)
need one shared way to present those diagnostics on CLI stderr, and #106
gave the KDL parser wrapper the ability to report a source location
(`line` / `column` / `offset`) for syntax failures that happen before any
KDL AST — and therefore any KDL-facing path — exists.

The existing `ValidationError` (`path` / `reason` / `expected`) cannot
express severity, the failing phase, or a source location, so #107 needed
to decide whether to extend it, replace it, or layer a new type on top.

This decision spans two packages (`core` provides, `cli` consumes) and
constrains future error reporting, so it is recorded as an ADR.

## Decision

Add a config diagnostics model and a pure string formatter to
`packages/core` (`packages/core/src/configDiagnostics.ts`), reused by both
`validate` and `generate`.

- `ConfigDiagnostic` carries `severity` (`error` / `warning`), `phase`
  (`syntax` / `codec` / `semantic`), optional `path`, optional `location`
  (`line` / `column` / `offset`), `reason`, and optional `expected`.
- `path` is the KDL-facing path (e.g.
  `installerer.binary.path-in-archive`) whenever one can be derived.
  Syntax diagnostics may have no path at all; they carry the parser's
  source `location` instead, when the parser reported one.
- Semantic diagnostics that cannot be mapped back to a KDL-facing path may
  carry a domain path (e.g. `$.owner`): semantic rules run on the decoded
  `InstallerConfig`, where the KDL AST is no longer available, and
  reverse-mapping is the codec layer's job (#108).
- `formatConfigDiagnostics` is a pure string formatter: no
  `process.stderr` / `console.error` / Node-specific APIs, no ANSI color,
  no terminal-width wrapping in v0. Writing to stderr — and reporting
  command errors such as file IO failures or invalid arguments, which are
  not config diagnostics — stays in the CLI command layer.
- The output contract (input order preserved; `severity[phase]` header
  followed by the path, else `line:column`, else nothing; indented
  `reason:` / optional `expected:` lines; blank-line separator; LF
  newlines with exactly one final newline) is pinned by snapshot tests.
- `ValidationError` is kept as the validators' accumulation type;
  `configDiagnosticFromValidationError` / `configDiagnosticFromKdlSyntaxError`
  convert at the boundary, adding the severity and phase that validators
  and the parser wrapper do not know about.
- `configDiagnosticFromKdlSyntaxError` collapses `KdlSyntaxError.message`
  to a single line (`\s+` -> single space) before it becomes `reason`.
  `kdljs`'s underlying chevrotain parser reports some syntax failures
  (e.g. an unterminated string) via a multi-line "one of these possible
  Token sequences" dump that can run past a hundred lines and contains
  blank lines of its own; left as-is, that would break the formatter's
  one-`reason:`-line-per-diagnostic contract and make its blank-line
  diagnostic separator ambiguous.

## Alternatives Considered

### Extend `ValidationError` with severity, phase, and location

Every validator in `installerConfig.ts` would have to stamp fields it has
no knowledge of (a validator does not know whether it runs as `codec` or
`semantic`, and never has a source location), and all existing call sites
would churn. Layering a conversion at the boundary keeps validators
unchanged.

### Replace `ValidationError` with `ConfigDiagnostic` everywhere

Same churn as above, and `parseInstallerConfig`'s public result shape
would change for the Web app (`apps/web`) as well, which only needs
path / reason / expected today. Rejected as out of proportion for #107.

### Put the formatter in `packages/cli`

The formatter is pure string manipulation and both `validate` / `generate`
need it; keeping it beside the model in runtime-neutral `packages/core`
follows the monorepo boundary ADR (20260703T231205Z) and leaves only the
actual stderr write in the CLI.

## Consequences

### Positive Consequences

- `validate` (#90) and `generate` (#89) share one diagnostics
  presentation, pinned by snapshots.
- Syntax failures are reportable with `line:column` even though no
  KDL-facing path exists yet.
- Validators and the Web app are untouched.

### Negative Consequences

- Two error shapes coexist (`ValidationError` inside validators,
  `ConfigDiagnostic` at the reporting boundary); converting is a small
  extra step for every future command.
- Until #108 lands, codec/semantic diagnostics surface domain paths
  (`$.…`) rather than KDL-facing paths.

### Neutral Consequences

- ANSI color / terminal-width wrapping, exit codes, and file IO error
  formatting are explicitly deferred; adding them later happens in the
  CLI layer without changing this model.
