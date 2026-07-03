# npm Node.js CLI Package

- Status: Accepted
- Created: 2026-07-03T13:43:02Z

## Context

[docs/adr/20260703T091000Z_cli-distribution-policy.md](./20260703T091000Z_cli-distribution-policy.md) decided that `installerer` ships an npm package (`@philomagi/installerer`) as an auxiliary Node.js CLI distribution, separate from the canonical Bun-compiled standalone executable. [Issue #81](https://github.com/tooppoo/installerer/issues/81) scopes the npm package metadata, `bin` entry, Node.js entrypoint, command dispatch skeleton, `build:npm`, and the npm publish boundary itself. Per-command implementations (`init` / `generate` / `validate` / `doctor`, issues #88-#91) and the standalone executable (issue #82) are out of scope here.

The root `package.json` (`private: true`) also drives the browser SPA build, its React/Tailwind dependencies, tests, and dev-only scripts (`dev`, `deploy`, `preview`, …). None of that belongs in a published npm CLI package, so publishing the root package as-is was not an option.

This repository's toolchain only sets up Bun (`.bun-version`, `.github/workflows/ci.yml`); neither Node.js nor npm are installed. The Node.js runtime boundary in the distribution ADR still applies to the _artifact_: the built CLI must run under Node.js and must not depend on `Bun.*` / `bun:*` at runtime. Building and verifying that artifact in this repository's own CI, however, has to happen without an actual `node` or `npm` binary available.

## Decision

### Publish directory, not the root package

`build:npm` (`bun run scripts/build-npm.ts`, using `Bun.build` — running the build under Bun is explicitly permitted by the distribution ADR) generates a dedicated publish directory, `dist-npm/` (gitignored), instead of publishing the repository root. `dist-npm/package.json` is generated from scratch (`scripts/npmPublishDir.ts#buildPublishPackageJson`), not copied from the root manifest: it carries only `name`/`version` (mirrored from root), `description`, `license`, `type`, `bin`, `files: ["bin"]`, `engines.node` (`>=20.0.0`), and repository metadata. It has no `private` field, no SPA dependencies, and no dev scripts. The root `package.json` keeps `private: true` and is never published directly.

`dist-npm/` contents: `package.json`, `README.md`, `LICENSE` (copied from root), and `bin/installerer.js` + `bin/installerer.js.map` (the built CLI). `files: ["bin"]` plus npm's automatic inclusion of `package.json`/`README`/`LICENSE` is the publish file-set boundary; nothing under `src/`, `public/`, `test/`, or `dist/` (the SPA build) is reachable from it.

### Node.js CLI entrypoint layering

The existing runtime-independent core (`src/cli/dispatch.ts`, from issue #86) is unchanged. A new `src/cli/node/` layer adds the Node.js runtime wiring:

- `runNodeCli.ts` calls `dispatchCli` and routes its result to an injectable `NodeCliIO` (`writeStdout` / `writeStderr` / `exit`), defaulting to real `process.*`. Injecting `NodeCliIO` lets tests assert routing without invoking `process.exit` inside the test process.
- `main.ts` is the actual `bin` entrypoint: a two-line file (`runNodeCli(process.argv.slice(2))`) with no injected IO, so it is exercised by spawning it as a real process rather than unit-tested directly.

`src/cli/command.ts` adds `CliCommandModule`, the interface each generator command module (`init` / `generate` / `validate` / `doctor`) is expected to implement so `dispatchCli` can route to it by name. It is not yet consumed by `dispatchCli` — issues #88-#91 wire their own module in and replace the unknown-command fallback for their command name, matching the extension point `dispatch.ts` already documents.

### CLI-scoped tsconfig

`tsconfig.cli.json` extends the root `tsconfig.json` but overrides `lib` to drop `DOM` and `types` to `["node"]` (dropping `bun`/`react`), and scopes `include` to `src/cli/**/*.ts` (excluding `*.test.ts`, which import `bun:test`). `bun run typecheck:cli` (`tsc --noEmit -p tsconfig.cli.json`) verifies the CLI entrypoint's import graph typechecks against Node.js types alone, with no DOM lib and no React/browser module reachable from it.

### Node.js runtime boundary verification

`Bun.build` targets `node` for `src/cli/node/main.ts`, so `node:*` built-in imports (e.g. `node:util` in `dispatch.ts`) stay external instead of being bundled, and the output is plain ESM JavaScript with no Bun-specific runtime dependency. `build:npm` then scans the bundle text for `Bun.` global usage and `bun:` module specifiers (`scripts/npmPublishDir.ts#findBunRuntimeReferences`) and for React/browser UI markers (`findBrowserUiReferences`), failing the build if either is found. `test/integration/npmCli.test.ts` re-asserts both against the generated artifact.

### Source map policy

`Bun.build`'s `sourcemap: "linked"` output embeds `sourcesContent` (the actual file text), but emits `sources` as bundler-output-relative paths that encode the full local/worktree directory structure (e.g. `../../../workspaces/installerer/.git/kura/worktrees/81/src/cli/dispatch.ts`). Since `sourcesContent` already carries the text needed for debugging, `build:npm` rewrites `sources` to clean, repo-relative paths (`src/cli/dispatch.ts`) instead (`sanitizeSourceMapSources`), and throws if a resulting path is still absolute or contains a `..` segment (`assertNoLeakedSourcePaths`) rather than allowing it into the published tarball. Any source outside the repo root falls back to `external/<basename>` instead of leaking its real path.

### npm/node tooling substitution for this repo's CI

Because this repository's CI only sets up Bun, `test/integration/npmCli.test.ts` uses `bun pm pack` (in place of `npm pack`) and `bun add <tarball>` (in place of `npm install <tarball>`) to pack and install the generated `dist-npm/` directory into a temporary project, then runs the installed `bin/installerer.js` under `bun` (in place of `node`) as the startup smoke test. Bun implements the same `node:*` built-ins the built artifact uses, so this is a faithful proxy for the `npm pack` / `npm install` / `node <built-cli>` acceptance criteria without adding a Node.js/npm setup step to CI.

## Alternatives Considered

### Publishing the root package directly

Removing `private: true` from the root `package.json` and publishing it as-is was rejected: it would ship the browser SPA's React/Tailwind dependencies, `wrangler`, dev scripts, and test files as part of the npm CLI package, contradicting the npm publish boundary this issue defines.

### Copying the root `package.json` into `dist-npm/` and stripping fields

Post-processing a copy (deleting `private`, `dependencies`, non-CLI `scripts`, …) was considered instead of building the publish manifest from scratch. Generating it from scratch was selected because it is simpler to reason about and test (`buildPublishPackageJson` is a pure function with an explicit output shape) than an allowlist/denylist over an evolving root manifest.

### Leaving bundler-relative source map paths as-is

Shipping `Bun.build`'s raw `sources` output was rejected because it leaks the machine-specific/worktree-specific absolute directory structure (see Decision), which the distribution ADR's source map policy explicitly prohibits.

### Adding Node.js/npm to CI for the smoke tests

Adding `actions/setup-node` to `.github/workflows/ci.yml` so `test/integration/npmCli.test.ts` could use real `npm pack` / `npm install` / `node` was considered. It was not selected for this issue: it adds a second language runtime to a Bun-only CI pipeline for a test suite that Bun's own npm-compatible tooling (`bun pm pack`, `bun add`, and Bun's `node:*` compatibility) already exercises meaningfully. This can be revisited later if npm/Bun behavior ever diverges in a way that matters for this package.

## Consequences

### Positive Consequences

- `dist-npm/` and its generated `package.json` give the npm publish boundary a single, testable definition instead of an implicit "whatever `npm publish` from root would pick up" boundary.
- `runNodeCli`'s injectable IO keeps `process.exit` out of the unit test process while still giving the entrypoint itself full process-IO responsibility, matching the runtime-independent-core boundary from issue #86.
- Source maps stay useful for stack traces (via `sourcesContent`) without leaking local machine or worktree paths.
- `CliCommandModule` gives issues #88-#91 a ready-made extension point instead of each inventing its own module shape.

### Negative Consequences

- `test/integration/npmCli.test.ts` verifies packaging/install/startup behavior via Bun's npm-compatible tooling, not real `npm`/`node`; a behavioral difference between Bun and Node.js in this narrow area would not be caught until a real Node.js environment (e.g. a future release job) exercises it.
- `dist-npm/package.json`'s field list must be kept in sync by hand as the CLI's needs evolve (e.g. adding a runtime dependency would require updating `buildPublishPackageJson`, not just root `package.json`).

### Neutral Consequences

- `CliCommandModule` is unused by `dispatchCli` until issues #88-#91 wire in real command modules.
- `engines.node` is set to `>=20.0.0` as a conservative baseline (Node.js `parseArgs`-era compatibility); it is not tied to any specific Node.js LTS schedule decision.
