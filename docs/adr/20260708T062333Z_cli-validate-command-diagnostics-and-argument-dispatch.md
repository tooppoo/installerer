# CLI `validate` Command: Exit Codes, Warning Diagnostics, and Per-Command Argument Dispatch

- Status: Accepted
- Created: 2026-07-08T06:23:33Z

## Context

#90 implements `installerer validate --config <path>`, the first CLI command (after `init`, #88) that needs its own option (`--config`) and its own argument-error causes (missing/duplicated `--config`, an unexpected positional, an unsupported option), distinct from the CLI-wide `unknownCommand`/`unknownOption` causes from #86 (docs/adr/20260703T132416Z).

Before this decision, `dispatchCli` (packages/cli/src/dispatch.ts) ran a single top-level `parseArgs` call over the _entire_ argv, declaring only `--help`/`-h` and `--version`/`-v`. Any option outside that set — anywhere in argv, regardless of which command it followed — threw and was reported as the generic top-level `unknownOption` (exit 2). `init` (#88) has no options of its own, so this was sufficient for it. `validate` cannot reuse this: it needs `--config` recognized without polluting the shared top-level schema with every future command's options (`generate`'s `--out`, #89), and its own argument mistakes need their own exit code (`invalidValidateArguments`, exit 8) rather than falling into the CLI-wide `unknownOption`.

Separately, #90 needs to report `ArchiveTemplateWarning`s (`path`/`reason`/`recommended`) through the shared `ConfigDiagnostic` model #107 introduced, which at the time only modeled error-shaped diagnostics (`path`/`reason`/`expected`).

This spans a public CLI contract (exit codes, per-command argument-error behavior) and a shared output/diagnostics format, so it is recorded as an ADR per docs/adr/README.md.

## Decision

### Exit codes

`validate` (#90) adds four exit codes to `CliExitCode` (packages/cli/src/exitCodes.ts), continuing the code-per-cause contract from docs/adr/20260703T132416Z:

| Exit Code | Cause                      |
| --------- | -------------------------- |
| 5         | config validation failed   |
| 6         | invalid config syntax      |
| 7         | config file read failed    |
| 8         | invalid validate arguments |

`configValidationFailed` (5) covers both `codec`-phase and `semantic`-phase failures from `validateInstallerConfigKdl`: both mean "the config's content is invalid," and a caller branching on exit code has no need to distinguish an unknown KDL node from a bad `owner` value. `invalidConfigSyntax` (6) is reserved for KDL text that does not parse at all (`parseKdlText` failure) — a distinct cause from a shape/semantic problem, since there is no KDL AST yet to point at. This corresponds to the "invalid JSON" cause named in #90's original scope, renamed for the KDL config format #99 later adopted.

### Diagnostics model: warnings

`ConfigDiagnostic` (packages/core/src/configDiagnostics.ts, #107) gains an optional `recommended` field, alongside the existing optional `expected`. `formatConfigDiagnostics` prints a `  recommended: ...` line when present, the same way it prints `  expected: ...`. A new `configDiagnosticFromArchiveTemplateWarning` converts an `ArchiveTemplateWarning` (`path`/`reason`/`recommended`) into a `severity: "warning"`, `phase: "semantic"` diagnostic, passing `path` through unchanged — the same boundary split #107/#108 established for `configDiagnosticFromValidationError`: this helper does no KDL-facing path translation, so callers with a KDL AST are expected to translate first.

`validateInstallerConfigKdl` (packages/core/src/kdl/installerConfigKdlValidation.ts, #108) is extended to translate its `warnings` through `domainPathToKdlFacingPath` before returning them, matching what it already did for `errors`. Previously only `errors` were translated; `warnings` were returned with `validateInstallerConfig`'s raw domain paths (`$.archive.nameTemplate`). Nothing outside its own tests consumed `validateInstallerConfigKdl` before #90, so this is a same-function consistency fix rather than a breaking change to a shipped contract.

### Per-command argument dispatch

`dispatchCli` no longer runs every argv through one shared `parseArgs` schema. Instead:

- `argv[0]` is looked up directly against the list of implemented `CliCommandModule`s (currently `init`, `validate`).
- If it matches a known command, the remaining `rest` of argv is handed to that command's `run` untouched — including `--help`/`-h`/`--version`/`-v`. Each command module owns parsing its own arguments end to end, including those two flags, and chooses its own exit code for its own argument errors: `validate` declares `--config` (`multiple: true`, so a repeated `--config` becomes detectable duplication rather than silently overwriting) _and_ `--help`/`--version` in one `parseArgs` call, and maps any other argument problem — an unrecognized option, an unexpected positional, a missing or duplicated `--config` — to `invalidValidateArguments` (8). `init` has no value-taking option, so it checks `args.includes("--help")`/`args.includes("-h")`/etc. directly and reuses the existing `unknownOption` (2) for anything else, since it has no command-specific cause to introduce.
- If `argv[0]` does not match a known command (no command at all, a bare flag, or a not-yet-implemented command like `generate`/`doctor`), the original single-`parseArgs` fallback still runs unchanged, keeping the pre-#90 `unknownCommand` (1) / `unknownOption` (2) behavior for that case.

Top-level `unknownCommand`/`unknownOption` therefore still cover exactly what they covered before #90: problems detected _before_ a real command is identified. Once dispatch has identified a real, implemented command, that command's own argument contract takes over.

`dispatchCli` deliberately does not pre-scan `rest` for `--help`/`--version` itself (e.g. via a blanket `rest.includes("--help")` before calling `command.run`), even though that would look like less duplication. A command with a value-taking option can have that value collide with a flag spelling: `installerer validate --config --help` (a forgotten `--config` value, where the next token happens to be `--help`) must be reported as a missing/ambiguous argument, not silently treated as `--help`. Only the command's own `parseArgs` call — which knows `--config` is `type: "string"` and therefore consumes exactly the one token after it as a value — can tell a bare `--help` apart from `--help` used as an (invalid) `--config` value. Node's `parseArgs` itself rejects `--config --help` as an ambiguous option argument, so declaring `help`/`version` in the same call as `config` gets that disambiguation for free instead of reimplementing it. A blanket `rest.includes` guard in `dispatchCli` was implemented and shipped in this branch's first draft, then found and corrected during review: it caused `--config --help`/`--config -v` to silently print help/version text with exit 0, without ever reporting the missing `--config` value. `init` still uses a plain `Array.includes` check safely, because it has no value-taking option for a flag spelling to collide with.

## Alternatives Considered

### Declare `--config` in the shared top-level `parseArgs` schema

This would let the existing single-parse structure keep working almost unchanged: add `config: { type: "string", multiple: true }` next to `help`/`version`. It was rejected because it does not scale — `generate`'s `--out` (#89) would need the same treatment, and every option any command ever needs would have to be globally declared and therefore globally _accepted_ (e.g. `installerer init --config x` would silently parse instead of being rejected). It also cannot produce a `validate`-specific exit code for an option `validate` doesn't support: since the shared schema would only know "recognized" vs. "not recognized" globally, a not-globally-recognized flag after `validate` would still hit the top-level `unknownOption` (2) fallback, not `validate`'s own `invalidValidateArguments` (8), contradicting #90's acceptance criteria.

### Give every `ConfigDiagnostic` both `expected` and `recommended` semantics under one field

Reusing `expected` for a warning's suggestion (rather than adding `recommended`) would avoid a new field, but conflates two different meanings: `expected` states what a value _must_ be for an error to go away, while `recommended` is a non-binding suggestion attached to a warning that is already valid config. Keeping them separate keeps `formatConfigDiagnostics`'s output honest about which kind of statement is being made.

## Consequences

### Positive Consequences

- `validate` (#90) and `generate` (#89) can each own their own option set and argument-error exit codes without a shared schema growing unboundedly or leaking options across commands.
- `configDiagnosticFromArchiveTemplateWarning` and the `recommended` field let `validate` (and later `generate`) present warnings with the same formatter, snapshot-pinned contract as errors.
- `init`'s existing tested behavior (`unknownOption` for any argument) is preserved unchanged, just relocated into `init.ts` itself.

### Negative Consequences

- Each future command module must now implement its own `parseArgs` call and its own argument-error mapping; there is no shared "declare an option, get validation for free" mechanism. Any command with a value-taking option must also declare `help`/`version` in that same `parseArgs` call itself (rather than getting them for free from `dispatchCli`), to avoid the value/flag collision described above. This is an accepted, deliberate trade-off given the alternative's scaling problem above.
- Two diagnostic annotation fields (`expected`, `recommended`) now coexist on `ConfigDiagnostic`, one used by errors, the other by warnings; a diagnostic that set both would render both lines, which no current call site does but which the type does not prevent.

### Neutral Consequences

- The top-level `--help`/`--version` fallback path (`argv[0]` not a known command) is untouched; its exact `parseArgs`-based behavior, including how it handles a bare unrecognized flag, is unchanged from before #90.
