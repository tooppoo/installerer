# CLI Exit Code Contract

- Status: Accepted
- Created: 2026-07-03T13:24:16Z

## Context

[src/cli/dispatch.ts](../../src/cli/dispatch.ts), implemented for [Issue #86](https://github.com/tooppoo/installerer/issues/86), returns an exit code for every result. Before this decision, every non-success result used the same generic exit code `1`, so a script calling `installerer` could not distinguish "unknown command" from "unknown option" (or, in later issues, from a config validation error, a network error, and so on) without parsing stderr text.

Exit codes are part of the CLI's public, script-facing contract: once shipped, scripts and CI pipelines may branch on them. This qualifies as "public CLI behavior" and an "output format", both explicit triggers for an ADR under `docs/adr/README.md`.

## Decision

The installerer CLI assigns one exit code per distinct error cause instead of one shared generic error code.

- Exit codes are defined once, in `src/cli/exitCodes.ts` (`CliExitCode`), and reused by `dispatchCli` and, later, by subcommand dispatch (`init` / `generate` / `validate` / `doctor`, Issues #88-#91).
- Once a cause ships with an assigned exit code, that value must not be reused for a different cause or renumbered. New causes get a new, previously-unused value.
- `0` is reserved for success and must not be reassigned.
- The full, current cause-to-exit-code table is recorded in [docs/exit-code.md](../exit-code.md), not duplicated elsewhere. `docs/exit-code.md` is intentionally a bare table (plus a link back to this ADR) so it stays cheap to extend as later issues add causes, and so it can be folded into `installerer --help` output later without needing a rewrite.
- Top-level `--help` does not embed the exit code table today. The causes available at this stage (`unknown command`, `unknown option`) are a small, incomplete subset of what `validate` / `generate` / `doctor` will need once implemented; embedding a table now risks churn in the help text and its snapshot test every time a later issue adds a cause.

The initial table, defined by this decision:

| Exit Code | Cause           |
| --------- | --------------- |
| 0         | success         |
| 1         | unknown command |
| 2         | unknown option  |

## Alternatives Considered

### One generic non-zero exit code for every error

This is what `dispatchCli` did before this decision. It is simpler but gives scripts no way to distinguish error causes without parsing stderr text, which is not a stable contract.

### Embedding the exit code table in top-level `--help` now

This would satisfy discoverability immediately, but the table is incomplete until #88-#91 land, so it would need repeated edits (and snapshot-test churn) to the primary help surface. Keeping the table in `docs/exit-code.md` now, with a note that it may move into `--help` later, avoids that churn while keeping the same underlying source of truth ready to be surfaced there.

## Consequences

### Positive Consequences

- Scripts can branch on exit code instead of parsing stderr text.
- `src/cli/exitCodes.ts` gives later subcommand issues (#88-#91) a single place to add new causes instead of inventing ad hoc numbers.
- `docs/exit-code.md` stays a cheap, low-churn artifact to extend.

### Negative Consequences

- Exit codes become a contract that constrains future changes: a cause's assigned value cannot be changed without breaking scripts that depend on it.
- The exit code table is not yet discoverable from `installerer --help` itself; users must know to look at `docs/exit-code.md`.

### Neutral Consequences

- Whether and how the exit code table gets folded into `--help` output is left for a later decision.
