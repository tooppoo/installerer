# Use package.json as the Canonical installerer Version Source

- Status: Accepted
- Created: 2026-07-03T13:35:36Z

> **Amendment (2026-07-03, [20260703T231205Z_monorepo-package-boundaries.md](./20260703T231205Z_monorepo-package-boundaries.md)):**
> With the monorepo migration (issue #100), the canonical version source is the
> CLI package's own manifest, `packages/cli/package.json`, not the root
> `package.json` (the root is now a private workspace root). `version.ts` lives
> at `packages/cli/src/version.ts` and imports `../package.json`. Everything
> else in this ADR — single source of truth, static JSON import, identical
> resolution across distribution channels, exact-value output — stands
> unchanged, and is in fact strengthened: the imported manifest is now the same
> static file that gets published, so no root-to-publish version mirroring
> remains.

## Context

[Issue #87](https://github.com/tooppoo/installerer/issues/87) implements `installerer --version` and `installerer -v`, the first CLI behavior that has to answer "what version is this?" instead of only static help text.

[docs/adr/20260703T091000Z_cli-distribution-policy.md](./20260703T091000Z_cli-distribution-policy.md) already decided that `installerer` ships as both a Bun-compiled standalone executable and an npm Node.js CLI package. `--version` must report the same value regardless of which distribution channel produced the running binary, and that value must be traceable back to one canonical source rather than being set independently per build job.

[docs/adr/20260703T124002Z_cli-help-frame-runtime-independent-core.md](./20260703T124002Z_cli-help-frame-runtime-independent-core.md) established `src/cli/` as a runtime-independent core: `dispatchCli` is a pure `argv -> { stdout, stderr, exitCode }` function that performs no process IO. `--version` has to fit that same shape, which means the version value must be resolvable at module load time without depending on a runtime entrypoint to inject it.

## Decision

The canonical source of the installerer CLI version is the `version` field of the root `package.json`. `installerer --version` and `installerer -v` print exactly that value, unchanged, to stdout, followed by a single newline, with exit code `0` and no stderr output. Program name, commit hash, git revision, and build revision must not be included in this output.

`src/cli/version.ts` resolves this value with a static JSON import:

```ts
import packageJson from "../../package.json" with { type: "json" };

export const cliVersion: string = packageJson.version;
```

`dispatchCli` (`src/cli/dispatch.ts`) imports `cliVersion` directly, the same way it already imports `topLevelHelpText`. No runtime entrypoint has to pass the version in; it is resolved once, at module load, from the same source for every distribution channel:

- The npm package build ships `package.json` as part of the published package, so a Node.js runtime resolves this relative import the normal way.
- Bun compile resolves and inlines static imports (including JSON) into the standalone executable at build time. This import is what satisfies the distribution policy's requirement that the standalone executable embed the version as a build-time constant: no separate embedding step, environment variable, or `define` substitution is needed, because Bun's bundler already does it for any statically imported module.

Both channels read the same field through the same import; there is no second version-resolution code path to keep in sync.

This differs from the existing `BUN_PUBLIC_COMMIT_HASH` pattern in `build.ts`, which resolves `git rev-parse` output through an environment variable and a `define` substitution. That pattern exists because a commit hash is not part of the source tree and must be computed by running a command at build time. A `package.json` field is already part of the source tree, so a plain static import is sufficient and does not need the same indirection. It is also consistent with this decision that commit/revision values are excluded from `--version` output: version and revision are deliberately resolved through different mechanisms because they are different kinds of information.

## Alternatives Considered

### Reading package.json from the filesystem at runtime

`--version` could `readFileSync` a path to `package.json` relative to the running module. This was not selected because it reintroduces filesystem IO into the runtime-independent core that `dispatchCli` deliberately avoids, and because the correct relative path differs between the unbundled source tree, the npm build output, and a Bun-compiled binary (which may not expose a real filesystem path for `import.meta.dir` at all).

### Environment-variable injection at build time (the `BUN_PUBLIC_COMMIT_HASH` pattern)

The version could be threaded through an environment variable and a `define` substitution in `build.ts`, mirroring the commit-hash pattern. This was not selected because it adds a build step and a second source of truth for a value that is already present verbatim in `package.json`; unlike a commit hash, no command needs to run to compute it.

### A separate VERSION file

A dedicated `VERSION` file at the repository root, read by both the CLI and other tooling, would avoid coupling to `package.json`'s shape. This was not selected because `package.json`'s `version` field is already the canonical version for the npm package itself; introducing a second file would create two values that must be kept manually in sync.

## Consequences

### Positive Consequences

- `--version` has exactly one source of truth, enforced by the type system (`packageJson.version` is read, not duplicated).
- The npm build and the Bun-compiled standalone executable share the same resolution code path, so there is nothing to keep in sync between them.
- `dispatchCli` stays a pure function with no injected version parameter and no process IO, consistent with docs/adr/20260703T124002Z.

### Negative Consequences

- Changing the `package.json` path depth of `src/cli/version.ts` requires updating the relative import path to `package.json`; this is a normal refactor risk, not a design flaw, but it is not caught until the module fails to resolve.
- This decision does not by itself guarantee the npm build output ships `package.json` at the expected relative location; that remains [Issue #81](https://github.com/tooppoo/installerer/issues/81)'s responsibility.

### Neutral Consequences

- Release archive naming, the GitHub Releases `VERSION` asset, and git tag creation are out of scope for this decision; they are expected to derive from the same `package.json` `version` field but are handled by their own issues (see the Issue #87 description).
- Whether `installerer`'s own version is ever injected into the _generated_ installer runtime is decided separately in [Issue #79](https://github.com/tooppoo/installerer/issues/79); this ADR only covers the `installerer` CLI's own `--version` output.
