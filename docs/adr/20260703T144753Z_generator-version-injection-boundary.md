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

## Alternatives Considered

### Import `cliVersion` (or `package.json`) directly inside `src/generatedInstaller/`

Would give the generator core the value with zero call-site changes. Rejected: it directly violates the issue's requirement that generator core not implicitly depend on `package.json`/`process.env`, and it would create a second code path resolving the same value that docs/adr/20260703T133536Z already centralized in `src/cli/version.ts`.

### Inject a version _provider_ function (`() => string`) instead of a plain string

Considered because the issue text raises "version provider" as an option. Rejected: `cliVersion` is already resolved once, synchronously, at module load time (docs/adr/20260703T133536Z) — there is no lazy/async/environment-dependent computation for a provider function to defer. A plain `string | undefined` parameter is simpler, keeps `createRenderContext`/`generateInstaller` trivially testable with fixed values, and does not add an indirection with no current use.

### Add `generator.version` to the metadata comment whitelist now, in the same change

Rejected because it is explicitly out of scope for issue #79. Doing it now would also force a decision about what value to default to when no caller supplies one, which conflicts with keeping generator core free of an implicit `package.json`/`process.env` dependency.

### Add the version as a field on `InstallerConfig`

Rejected: `InstallerConfig` is user-controlled, config-derived data validated from the browser form. The installerer version is neither user input nor derived from the config; conflating the two would make `InstallerConfig` a channel for build metadata it has no other reason to carry.

## Consequences

### Positive Consequences

- Generator core (`src/generatedInstaller/`) has no implicit dependency on `package.json` or `process.env`; the only way it ever sees a version value is through this explicit, documented parameter.
- No existing call site changes, because the parameter is optional and currently unread.
- `generateInstaller(config)` remains deterministic per `(config, generatorVersion)` pair; passing different `generatorVersion` values produces byte-identical output today, which is directly asserted by `src/generatedInstaller/renderContext.test.ts`.
- A future change that whitelists `generator.version` into `renderMetadataComment` only needs to read `context.generatorVersion` and wire a real caller (e.g. `src/App.tsx` importing `cliVersion`); it does not need another signature change.

### Negative Consequences

- `RenderContext.generatorVersion` is unused by every current section renderer. A reader unfamiliar with this ADR could mistake it for dead code; the doc comments on `RenderContext` and `generateInstaller` exist specifically to prevent that.
- Nothing enforces that a future caller sources `generatorVersion` from `cliVersion` specifically, rather than from an arbitrary or commit-hash-shaped string; that discipline is documented here, not type-enforced.

### Neutral Consequences

- Whether and how `generatorVersion` is ever surfaced in the generated installer (metadata comment or otherwise) is decided by a future issue extending the #74 whitelist, not by this ADR.
- `src/App.tsx` and `src/cli/` are not changed to pass `generatorVersion` by this decision; wiring a real caller is deferred to the same future change that consumes it.
