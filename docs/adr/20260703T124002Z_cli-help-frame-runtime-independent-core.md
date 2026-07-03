# CLI Help Frame and Runtime-Independent Core

- Status: Accepted
- Created: 2026-07-03T12:40:02Z

## Context

[Issue #86](https://github.com/tooppoo/installerer/issues/86) implements `installerer --help` and `installerer -h`, the first `installerer` CLI behavior implemented in this repository.

[docs/adr/20260703T091000Z_cli-distribution-policy.md](./20260703T091000Z_cli-distribution-policy.md) already decided that the CLI is distributed both as a Bun-compiled standalone executable and as an npm Node.js CLI package, and that CLI-specific file IO, stdout, stderr, and exit-code behavior must stay outside the runtime-independent generator core.

Two follow-up issues build real entrypoints on top of this one: [Issue #81](https://github.com/tooppoo/installerer/issues/81) (npm Node.js CLI entrypoint and dispatch skeleton) and [Issue #82](https://github.com/tooppoo/installerer/issues/82) (Bun standalone executable). Both are blocked on this issue and on [Issue #87](https://github.com/tooppoo/installerer/issues/87) (`--version`) so that help text is defined once and reused, not duplicated per runtime.

This issue also needs a structure that later per-command help ([Issue #88](https://github.com/tooppoo/installerer/issues/88)-[#91](https://github.com/tooppoo/installerer/issues/91)) can reuse without redesigning help rendering each time.

## Decision

`installerer` CLI help is implemented as a runtime-independent core under `src/cli/`:

- `CliHelpFrame` (`src/cli/help.ts`) is the minimal shared shape for any command's help text: a required `abstraction` string, a required `usage` string list, and optional `commands` / `options` string lists. It does not model a command parser, option schema, or validation schema.
- `renderHelpText` (`src/cli/help.ts`) renders a `CliHelpFrame` to text. The Abstraction and Usage sections are always rendered. The Commands and Options sections are rendered only when the corresponding field is given and non-empty.
- `topLevelHelpFrame` / `topLevelHelpText` (`src/cli/topLevelHelp.ts`) are the concrete top-level help content: the generator-only commands (`init`, `validate`, `generate`, `doctor`, `--version`, `--help`) and the global options (`-h, --help`, `-v, --version`). Package-installer-like commands (`install`, `run`, `exec`, `upgrade`, `uninstall`) must not appear.
- `dispatchCli` (`src/cli/dispatch.ts`) is a pure function `argv -> { stdout, stderr, exitCode } | undefined`. It recognizes only `--help` and `-h` as the first argument and returns the rendered top-level help on stdout with exit code 0 and no stderr output. Any other input, including no arguments at all, returns `undefined` and is left for later issues (the no-argument CLI dispatch skeleton in a later issue, and each subcommand's own issue) to define.

This module performs no process IO: it does not write to `process.stdout`/`process.stderr` and does not call `process.exit`. Runtime entrypoints (npm CLI in #81, standalone executable in #82) call `dispatchCli` and are responsible for actually writing its result and exiting with its `exitCode`.

## Alternatives Considered

### A full argument-parsing library

An argument-parsing library would also solve `--help` routing, but it would pull in a dependency and a command/option schema before any subcommand exists. This issue explicitly scopes out command parsers and option schemas, so it was not selected.

### Building the help frame directly inside the npm/Bun entrypoints

Defining help text inside each runtime entrypoint would duplicate the same text (or require one entrypoint to import internals of the other). Keeping it in a runtime-independent core lets both #81 and #82 import the same `topLevelHelpText` and `dispatchCli` without duplication.

## Consequences

### Positive Consequences

- Help text has one definition, reused by every CLI distribution channel.
- `CliHelpFrame` gives subcommand help issues (#88-#91) a ready-made rendering utility instead of inventing their own format.
- `dispatchCli` is trivially unit-testable without spawning a process.

### Negative Consequences

- `dispatchCli` only handles `--help` / `-h` for now; the entrypoints built in #81/#82 must still decide what to do when it returns `undefined`.

### Neutral Consequences

- No `bin` entry, package metadata, or executable wiring is added by this issue; that remains #81's and #82's scope.
