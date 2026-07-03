# Generated installer runtime requirements are derived from typed dependency definitions

- Status: Accepted
- Created: 2026-07-03T17:12:02Z

## Context

The generated installer, the Web UI's `archive.format` hint, and the docs (`docs/generated-installer-runtime.md`, `docs/installer-contract.md`) each independently listed the generated installer's runtime dependencies (`uname`, `curl`, `tar`/`unzip`, `sha256sum`/`shasum`, ...). Nothing kept these in sync: `download.ts`/`extraction.ts` invoke `ls` unconditionally, but only the docs were missing it from their lists — a small but real instance of the drift this decision closes off. As the number of surfaces that need to describe "what does this installer need to run" grew (Web UI, this ADR's CLI-reusable renderer, and the generated installer's own introspection, below), maintaining these as independent hand-written lists would only get more likely to drift.

This qualifies as a decision worth recording because it fixes an output format (the generated installer gains two new, script-facing options) and a runtime dependency policy (issue #75's requirement, tracked from #29 and #74).

## Decision

Runtime dependency information is defined once, as typed data in `src/runtimeDependencies/definitions.ts` (`RuntimeDependencyDefinition[]` plus premise entries), not as hand-written prose or shell fragments. `src/runtimeDependencies/resolve.ts` exports `resolveRuntimeDependencies(config)`, which derives the dependency set that applies to a given `InstallerConfig` (e.g. `tar` only for `archive.format: "tar.gz"`). Every other surface consumes this resolver's output instead of re-deriving its own list:

- The Web UI's "Runtime requirements" panel (`src/App.tsx`) and the `archive.format` hint (`src/installerForm.ts`) render `resolveRuntimeDependencies(config)` directly.
- `src/runtimeDependencies/renderText.ts` and `renderJson.ts` are reusable Text/JSON renderers over a resolved value, intended for reuse by installerer's own CLI in a later issue. Text is the default human-facing format; the JSON shape is internal-use only (snapshot-tested, not an external compatibility contract) until a later issue commits to it.
- `docs/runtime-dependencies.md` is generated from the same definitions by `scripts/generate-runtime-dependency-docs.ts` (`bun run docs:generate` / `--check`). `docs/generated-installer-runtime.md` and `docs/installer-contract.md` link to it instead of repeating the list.
- The generated installer embeds a **static** rendering of the resolved requirements at generation time — `print_requirements()` (`src/generatedInstaller/sections/requirements.ts`) is literally `renderRuntimeRequirementsText`'s output turned into `printf` lines. It does not read TS/JSON at runtime; the config is already fully known when `install.sh` is generated.
- `check_requirements()` (`src/generatedInstaller/sections/requirementChecks.ts`) is generated from each dependency's declarative `check` strategy (`command` / `any-command` / `all-commands`) rather than hand-written `command -v` calls, so the same definitions drive both the human-readable text and the runtime probe.

Dependency definitions carry semantic data and a check strategy only, never raw shell (`check: { type: "command", command: "curl" }`, not a shell snippet). Every `command` embedded in generated shell is restricted to `/^[A-Za-z0-9._+-]+$/` (`assertSafeCommandName`, enforced once in `resolveRuntimeDependencies`) and is always emitted through `shellLiteral` quoting, so even a hypothetical unsafe value could not be injected as shell code.

Three runtime conditions the installer relies on but does not probe — POSIX `sh` itself, HTTPS access to GitHub Releases, and install-directory write permission — are modeled uniformly as `RuntimePremiseEntry` values tagged with a `premise: "shell" | "network" | "filesystem"` category, not as dependencies with a `check`. This keeps `ResolvedRuntimeDependencies.dependencies` restricted to things that are genuinely checkable, so `check_requirements()` never needs a branch for "dependencies we don't check" — it iterates `dependencies` for probes and prints `premises` (minus `shell`) verbatim under a `Not checked:` section.

The generated installer gains two new options:

```text
--requirements        # prints resolved requirements, exits 0, no side effects
--check-requirements  # probes checkable dependencies, aggregates results, never fails fast
```

Both are **terminal options**: they run before target detection, install-dir resolution, `check_runtime_dependencies`, or any network/filesystem access, and never reach `install_latest`/`install_pin`. The installer's options are split into **install options** (`--version`, `--install-dir`) and **test options** (`--requirements`, `--check-requirements`); combining an install option with a test option is rejected, combining two options from the same group is allowed. `--requirements --check-requirements` runs both, in that order, and the process exit code follows `--check-requirements`'s result (`0` only if every checkable dependency is present).

## Alternatives Considered

### Keep hand-written lists, add a lint/test that greps docs against code

This would have caught future drift without a new module, but it does not address the deeper problem: the Web UI, the generated installer's dependency gate, and any future CLI surface would still each hand-encode the same command names, check logic, and conditional-on-archive-format branching independently. A resolver removes the duplication itself rather than just detecting when it diverges.

### Model network/filesystem as dependencies with a `not-checkable` check variant

An earlier draft added `{ type: "not-checkable", reason }` to `RuntimeDependencyCheck` and gave every dependency a `kind` (`"command" | "command-alternative" | "network" | "filesystem"`). This was simplified: `kind` was redundant with `check.type` (a `check: { type: "any-command" }` dependency is self-evidently an alternative-commands check), and modeling network/filesystem as "dependencies that can't be checked" forced `check_requirements()` to filter them out of every loop it ran. Splitting `ResolvedRuntimeDependencies` into `dependencies` (always genuinely checkable) and `premises` (never checkable, categorized by `premise`) removes both the redundant field and the filtering.

### Embed the Runtime Dependencies list as a marked block inside both existing docs

Rather than one independent `docs/runtime-dependencies.md`, an earlier draft generated the same list twice, injected between `<!-- runtime-dependencies:start/end -->` markers in `docs/generated-installer-runtime.md` and `docs/installer-contract.md`. This still duplicates generated content across two files and adds marker-integrity risk (a manually broken marker silently stops being checked). A single generated document plus a one-line reference from each existing doc keeps exactly one canonical copy.

### Let `check_requirements()` read the resolved dependency list from an embedded JSON blob at runtime

Rejected as a non-goal: the generated installer must not read TS/JSON at runtime. Since the config is fully resolved at generation time, `print_requirements()` can simply be pre-rendered `printf` lines, and `check_requirements()` can be pre-rendered `command -v` branches — no runtime parsing is needed.

## Non-Goals

- Wiring `renderRuntimeRequirementsText`/`renderRuntimeRequirementsJson` into installerer's own CLI (`src/cli/`) — a later issue's job once CLI command dispatch exists for it.
- Treating the JSON renderer's shape as an external compatibility contract. It is pinned by a snapshot test for regression purposes only.
- Actively probing network reachability or filesystem write permission. Both remain `Not checked:` items to avoid unwanted network calls or side effects during `--check-requirements`.
- Treating POSIX `sh` as a checkable command. It is a runtime premise the installer assumes, not something `command -v` can meaningfully probe.

## Consequences

### Positive Consequences

- Adding, removing, or re-labeling a runtime dependency (e.g. a future MVP command) is one edit to `src/runtimeDependencies/definitions.ts`; the Web UI, docs, and generated installer all pick it up automatically the next time `install.sh` is generated or `bun run docs:generate` runs.
- `check_requirements()` cannot silently omit a dependency the way a hand-maintained `command -v` list could, since it is generated from the same list `print_requirements()` uses.
- `docs:check` now catches Runtime Dependencies doc drift structurally, instead of relying on a reviewer noticing a hand-edited list is stale.

### Negative Consequences

- Every generated `install.sh` grows by two functions and a few `main()` branches, even for configs that never use `--requirements`/`--check-requirements`.
- `docs/runtime-dependencies.md` is now a build artifact that must be regenerated (`bun run docs:generate`) whenever `src/runtimeDependencies/definitions.ts` changes, adding one more generated file to keep in sync locally before committing.

### Neutral Consequences

- The JSON renderer's shape may still change without a deprecation cycle until a later issue commits to it as a CLI-facing contract.
