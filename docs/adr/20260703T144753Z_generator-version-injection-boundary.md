# Generator Core Accepts `generatorVersion` As An Explicit, Unconsumed Optional Parameter

- Status: Accepted
- Created: 2026-07-03T14:47:53Z

## Context

[Issue #87](https://github.com/tooppoo/installerer/issues/87) / [docs/adr/20260703T133536Z_cli-version-source.md](./20260703T133536Z_cli-version-source.md) defined `installerer`'s own version: `src/cli/version.ts` resolves `cliVersion` from the root `package.json`'s `version` field via a static import, at module load time, with no filesystem IO and no runtime injection.

[Issue #79](https://github.com/tooppoo/installerer/issues/79) asks how `src/generatedInstaller/` (the generator core) can deterministically reference that same value, so that a future change can decide whether to surface it in the generated installer. It explicitly scopes out actually adding `generator.version` to the metadata comment whitelist established in [docs/adr/20260703T082713Z_effective-config-metadata-comment-in-generated-installer.md](./20260703T082713Z_effective-config-metadata-comment-in-generated-installer.md); that ADR's Neutral Consequences already flagged `generator.version` as withheld pending exactly this decision. This ADR only covers the injection boundary itself.

Constraints carried over from the issue:

- The installerer version is a build/package-derived value, not something derived from `InstallerConfig`. `generateInstaller(config)`'s existing purity/determinism (one `InstallerConfig` always produces the same script — see [docs/adr/20260701T230740Z_fixture-driven-installer-generation-tests.md](./20260701T230740Z_fixture-driven-installer-generation-tests.md)) must not become dependent on which build produced the running code.
- `src/generatedInstaller/` must not implicitly depend on `package.json` or `process.env`. Only `src/cli/version.ts` (and, per docs/adr/20260703T133536Z, the npm/Bun build tooling) is allowed to resolve the version from `package.json`.
- A version value must not be confused with `BUN_PUBLIC_COMMIT_HASH` or any other commit-hash/revision value; those are excluded from the metadata comment whitelist for reproducibility reasons independent of this decision.
- Tests must be able to fix the version value so that adding this parameter cannot destabilize the fixture-driven snapshot tests.

## Decision

`RenderContext` (`src/generatedInstaller/renderContext.ts`) gains a `generatorVersion: string | undefined` field. `createRenderContext(config, generatorVersion?)` and `generateInstaller(config, generatorVersion?)` (`src/generatedInstaller/index.ts`) both accept it as an **optional second parameter**, an explicit external input separate from `config`:

```ts
export type RenderContext = {
  config: InstallerConfig;
  templateSegments: ArchiveTemplateSegment[];
  archiveSuffix: string;
  generatorVersion: string | undefined;
};

export function createRenderContext(
  config: InstallerConfig,
  generatorVersion?: string,
): RenderContext {
  /* ... */
}

export function generateInstaller(config: InstallerConfig, generatorVersion?: string): string {
  /* ... */
}
```

This mirrors the existing `previewArchiveNames(config, version)` (`src/generatedInstaller/index.ts`), the one function in this module that already takes a version string as a plain explicit parameter alongside `config`, rather than folding it into `InstallerConfig`.

Nothing under `src/generatedInstaller/` imports `package.json`, `cliVersion`, or reads `process.env`. A caller that wants the generated installer's metadata to eventually reflect the installerer version is responsible for sourcing it itself — for example, importing `cliVersion` from `src/cli/version.ts` — and passing it explicitly. No such caller is wired up by this decision: `src/App.tsx` and `src/cli/` are unchanged, and no section renderer reads `RenderContext.generatorVersion`. `renderMetadataComment` continues to emit only the static `generator.name` / `generator.sourceUrl` constants it already has; whitelisting `generator.version` is left to a future issue, per #79's own scoping.

Because the parameter is optional and unread, every existing call site (`App.tsx`, and the `generateInstaller`/`createRenderContext` call sites in `installerForm.test.ts`, `installerGenerator.test.ts`, and the integration/e2e tests) keeps compiling and behaving identically without modification.

`generatorVersion` must only ever hold a version string sourced the same way `cliVersion` is (ultimately `package.json`'s `version` field). It must not be assigned a commit hash or other revision value; a future revision-like field, if ever needed, must be named separately (e.g. `generatorRevision`) rather than overloading this one.

## Enforcement

"Generator core must not implicitly depend on `package.json` or `process.env`" is a rule a future edit can violate by accident (for example, a section renderer added later reaching for `process.env.SOMETHING` directly instead of threading a `RenderContext` field). This must be enforced by CI, not only by the doc comments above.

`src/generatedInstaller/.oxlintrc.json` is a [nested oxlint config](https://oxc.rs/docs/guide/usage/linter/nested-config.html) that applies only to files under `src/generatedInstaller/` (including `sections/`) and adds two rules from oxlint's built-in ESLint-core rule set — no custom plugin needed, since these already cover the requirement:

- `no-restricted-imports` with a `patterns` group rejecting any import matching `**/package.json` or `**/../cli/**` (i.e. anything reaching into `src/cli/`, such as `cliVersion`).
- `no-restricted-globals` rejecting any reference to the `process` global (covers `process.env` and any other process state, not just the specific `BUN_PUBLIC_COMMIT_HASH` case).

Both rules are part of oxlint's built-in `eslint` rule set (ports of ESLint core's `no-restricted-imports`/`no-restricted-globals`), already exercised by this repository's existing `bun run lint` (`oxlint --deny-warnings .`), so this required no new tooling, dependency, or plugin authoring. Oxlint's JS-plugin API (for genuinely custom rules) was in alpha at the time of this decision and was not needed here; see Alternatives Considered.

## Alternatives Considered

### Import `cliVersion` (or `package.json`) directly inside `src/generatedInstaller/`

Would give the generator core the value with zero call-site changes. Rejected: it directly violates the issue's requirement that generator core not implicitly depend on `package.json`/`process.env`, and it would create a second code path resolving the same value that docs/adr/20260703T133536Z already centralized in `src/cli/version.ts`.

### Inject a version _provider_ function (`() => string`) instead of a plain string

Considered because the issue text raises "version provider" as an option. Rejected: `cliVersion` is already resolved once, synchronously, at module load time (docs/adr/20260703T133536Z) — there is no lazy/async/environment-dependent computation for a provider function to defer. A plain `string | undefined` parameter is simpler, keeps `createRenderContext`/`generateInstaller` trivially testable with fixed values, and does not add an indirection with no current use.

### Add `generator.version` to the metadata comment whitelist now, in the same change

Rejected because it is explicitly out of scope for issue #79. Doing it now would also force a decision about what value to default to when no caller supplies one, which conflicts with keeping generator core free of an implicit `package.json`/`process.env` dependency.

### Add the version as a field on `InstallerConfig`

Rejected: `InstallerConfig` is user-controlled, config-derived data validated from the browser form. The installerer version is neither user input nor derived from the config; conflating the two would make `InstallerConfig` a channel for build metadata it has no other reason to carry.

### Write a custom oxlint JS plugin to enforce the no-implicit-dependency rule

Considered for the Enforcement section above, since a project-specific "generator core must not read `package.json`/`process.env`" rule is exactly the kind of thing a custom lint rule exists for. Rejected in favor of oxlint's built-in `no-restricted-imports` and `no-restricted-globals` (both ports of long-stable ESLint core rules): they already express this exact constraint through a nested `.oxlintrc.json`, so a custom rule would only duplicate coverage that already exists. Oxlint's JS-plugin support was also alpha at the time of this decision, an additional reason not to depend on it for a repository safety guard. If a genuinely project-specific check (not expressible with `no-restricted-imports`/`no-restricted-globals`) is needed later, a custom plugin remains an option — and should be designed so it could later be extracted and published as an independent plugin, not written as a repository-only one-off.

## Consequences

### Positive Consequences

- Generator core (`src/generatedInstaller/`) has no implicit dependency on `package.json` or `process.env`; the only way it ever sees a version value is through this explicit, documented parameter.
- No existing call site changes, because the parameter is optional and currently unread.
- `generateInstaller(config)` remains deterministic per `(config, generatorVersion)` pair; passing different `generatorVersion` values produces byte-identical output today, which is directly asserted by `src/generatedInstaller/renderContext.test.ts`.
- A future change that whitelists `generator.version` into `renderMetadataComment` only needs to read `context.generatorVersion` and wire a real caller (e.g. `src/App.tsx` importing `cliVersion`); it does not need another signature change.
- The "no implicit dependency on `package.json`/`process.env`" rule is enforced by CI (`bun run lint`), not only documented: `src/generatedInstaller/.oxlintrc.json` fails the build if a future edit imports `package.json` or `src/cli/`, or reads `process`, from anywhere under `src/generatedInstaller/`.

### Negative Consequences

- `RenderContext.generatorVersion` is unused by every current section renderer. A reader unfamiliar with this ADR could mistake it for dead code; the doc comments on `RenderContext` and `generateInstaller` exist specifically to prevent that.
- The `no-restricted-imports`/`no-restricted-globals` rules (see Enforcement) catch a future section renderer reaching for `package.json`, `src/cli/`, or `process` directly, but they cannot enforce that a caller who does pass `generatorVersion` sourced it from `cliVersion` specifically rather than from an arbitrary or commit-hash-shaped string; that half of the discipline is documented here, not enforced by lint or the type system.

### Neutral Consequences

- Whether and how `generatorVersion` is ever surfaced in the generated installer (metadata comment or otherwise) is decided by a future issue extending the #74 whitelist, not by this ADR.
- `src/App.tsx` and `src/cli/` are not changed to pass `generatorVersion` by this decision; wiring a real caller is deferred to the same future change that consumes it.
