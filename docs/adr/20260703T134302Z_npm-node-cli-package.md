# npm Node.js CLI Package

- Status: Accepted
- Created: 2026-07-03T13:43:02Z

## Context

[docs/adr/20260703T091000Z_cli-distribution-policy.md](./20260703T091000Z_cli-distribution-policy.md) decided that `installerer` ships an npm package (`@philomagi/installerer`) as an auxiliary Node.js CLI distribution, separate from the canonical Bun-compiled standalone executable. [Issue #81](https://github.com/tooppoo/installerer/issues/81) scopes the npm package metadata, `bin` entry, Node.js entrypoint, command dispatch skeleton, `build:npm`, and the npm publish boundary itself. Per-command implementations (`init` / `generate` / `validate` / `doctor`, issues #88-#91) and the standalone executable (issue #82) are out of scope here.

The root `package.json` (`private: true`) also drives the browser SPA build, its React/Tailwind dependencies, tests, and dev-only scripts (`dev`, `deploy`, `preview`, …). None of that belongs in a published npm CLI package, so publishing the root package as-is was not an option.

This repository's toolchain, before this issue, only set up Bun (`.bun-version`, `.github/workflows/ci.yml`); neither Node.js nor npm were installed. The Node.js runtime boundary in the distribution ADR applies to the built _artifact_: it must run under Node.js and must not depend on `Bun.*` / `bun:*` at runtime. Verifying that with real `npm pack` / `npm install` / `node <built-cli>` — the tools the acceptance criteria name — requires Node.js/npm in CI, not just Bun's npm-compatible tooling.

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

`sanitizeSourceMapSources` only rewrites the `sources` array; it does not touch `sourcesContent`, `names`, or any other map field. `build:npm` additionally scans the map's full serialized text (`findMachineSpecificPathLeaks`, `findSecretLeaks`) for the repo's own absolute checkout path, common home-directory prefixes (`/home/`, `/Users/`, `/root/`, `/workspaces/`), and common secret/token/private-key shapes (PEM private key headers, AWS/GitHub/Slack/Google API key patterns), and throws if either finds anything. This is a whole-file safety net on top of the `sources`-array rewrite, guarding against a leak entering through `sourcesContent` (embedded file text) instead.

### Real npm/node verification in CI

`.github/workflows/ci.yml` adds `actions/setup-node` (Node.js 20, matching `engines.node`) alongside the existing Bun setup. `test/integration/npmCli.test.ts` packs and installs the generated `dist-npm/` directory with real `npm pack` / `npm install` into a temporary project, then runs the installed CLI two ways: directly via `node <installed-bin>`, and through npm's generated `node_modules/.bin/installerer` shim (the actual command the README's `npm install -g @philomagi/installerer` / `installerer --help` path resolves to). This directly exercises the acceptance criteria's named tools instead of a Bun-based proxy for them, at the cost of a second language runtime in an otherwise Bun-only CI pipeline (see Alternatives Considered).

## Alternatives Considered

### Publishing the root package directly

Removing `private: true` from the root `package.json` and publishing it as-is was rejected: it would ship the browser SPA's React/Tailwind dependencies, `wrangler`, dev scripts, and test files as part of the npm CLI package, contradicting the npm publish boundary this issue defines.

### Copying the root `package.json` into `dist-npm/` and stripping fields

Post-processing a copy (deleting `private`, `dependencies`, non-CLI `scripts`, …) was considered instead of building the publish manifest from scratch. Generating it from scratch was selected because it is simpler to reason about and test (`buildPublishPackageJson` is a pure function with an explicit output shape) than an allowlist/denylist over an evolving root manifest.

### Leaving bundler-relative source map paths as-is

Shipping `Bun.build`'s raw `sources` output was rejected because it leaks the machine-specific/worktree-specific absolute directory structure (see Decision), which the distribution ADR's source map policy explicitly prohibits.

### Using Bun's npm-compatible tooling instead of real npm/node in CI

An earlier version of this decision used `bun pm pack` / `bun add <tarball>` / `bun <built-cli>` as proxies for `npm pack` / `npm install` / `node <built-cli>`, to avoid adding a second language runtime to this otherwise Bun-only CI pipeline. This was rejected on review: the acceptance criteria name `npm pack`, `npm install`, and `node <built-cli>` specifically, and `bin` shim generation, packed file-mode preservation, and startup behavior are exactly the kind of thing that can differ between Bun's npm-compatible tooling and real npm/Node.js. `actions/setup-node` was added instead so the smoke tests exercise the real toolchain.

### Scanning only the `sources` array for leaked paths

An earlier version of the source map policy only sanitized and asserted against the `sources` array, leaving `sourcesContent` unscanned. This was rejected on review: `sourcesContent` (the embedded file text) is exactly where a leaked absolute path or secret would most plausibly show up if a future CLI source file printed one, and the acceptance criteria explicitly ask for both absolute-path and secret/token leakage checks. `findMachineSpecificPathLeaks` / `findSecretLeaks` scan the map's full text instead.

## Consequences

### Positive Consequences

- `dist-npm/` and its generated `package.json` give the npm publish boundary a single, testable definition instead of an implicit "whatever `npm publish` from root would pick up" boundary.
- `runNodeCli`'s injectable IO keeps `process.exit` out of the unit test process while still giving the entrypoint itself full process-IO responsibility, matching the runtime-independent-core boundary from issue #86.
- Source maps stay useful for stack traces (via `sourcesContent`) without leaking local machine or worktree paths, or embedded secrets.
- `CliCommandModule` gives issues #88-#91 a ready-made extension point instead of each inventing its own module shape.
- `test/integration/npmCli.test.ts` exercises the real `npm pack` / `npm install` / `node` / npm bin-shim path, so a Bun/Node.js behavioral difference in packaging or startup would be caught in this repository's own CI, not only in a future release job.

### Negative Consequences

- CI now depends on two language runtimes (Bun and Node.js) instead of one.
- `dist-npm/package.json`'s field list must be kept in sync by hand as the CLI's needs evolve (e.g. adding a runtime dependency would require updating `buildPublishPackageJson`, not just root `package.json`).
- The machine-specific-path and secret scans are pattern-based (a fixed prefix list and a handful of well-known token shapes), not a general-purpose secret scanner; a leak in a shape not covered by `SECRET_PATTERNS` would not be caught.

### Neutral Consequences

- `CliCommandModule` is unused by `dispatchCli` until issues #88-#91 wire in real command modules.
- `engines.node` is set to `>=20.0.0` as a conservative baseline (Node.js `parseArgs`-era compatibility); it is not tied to any specific Node.js LTS schedule decision.
