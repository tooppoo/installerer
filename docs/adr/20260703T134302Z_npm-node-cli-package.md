# npm Node.js CLI Package

- Status: Accepted
- Created: 2026-07-03T13:43:02Z

> **Amendment (2026-07-03, [20260703T231205Z_monorepo-package-boundaries.md](./20260703T231205Z_monorepo-package-boundaries.md)):**
> The monorepo migration (issue #100) replaces two parts of this decision:
>
> - The publish `package.json` is **no longer generated from scratch**
>   (`buildPublishPackageJson` is gone). CLI package metadata is owned by the
>   static, reviewable `packages/cli/package.json`; `build:npm` copies it into
>   the publish directory, stripping only workspace-only fields (`$schema`,
>   `scripts`, `devDependencies`).
> - The publish directory moved from the repository-root `dist-cli/npm/` to
>   `packages/cli/dist/npm/`, and `build:npm` / its helpers moved to
>   `packages/cli/scripts/`. The `dist/`-wipe collision that motivated a
>   separate top-level `dist-cli/` no longer exists because the SPA now builds
>   into `apps/web/dist/`.
>
> The rest of this ADR — publish-directory-not-root, the Node.js entrypoint
> layering (now `packages/cli/src/node/`), the CLI-scoped tsconfig (now
> `packages/cli/tsconfig.json`), the runtime-boundary scans, the no-source-map
> policy, `engines.node`, and the split CI verification jobs — stands.

## Context

[docs/adr/20260703T091000Z_cli-distribution-policy.md](./20260703T091000Z_cli-distribution-policy.md) decided that `installerer` ships an npm package (`@philomagi/installerer`) as an auxiliary Node.js CLI distribution, separate from the canonical Bun-compiled standalone executable. [Issue #81](https://github.com/tooppoo/installerer/issues/81) scopes the npm package metadata, `bin` entry, Node.js entrypoint, command dispatch skeleton, `build:npm`, and the npm publish boundary itself. Per-command implementations (`init` / `generate` / `validate` / `doctor`, issues #88-#91) and the standalone executable (issue #82) are out of scope here.

The root `package.json` (`private: true`) also drives the browser SPA build, its React/Tailwind dependencies, tests, and dev-only scripts (`dev`, `deploy`, `preview`, …). None of that belongs in a published npm CLI package, so publishing the root package as-is was not an option.

This repository's toolchain, before this issue, only set up Bun (`.bun-version`, `.github/workflows/ci.yml`); neither Node.js nor npm were installed. The Node.js runtime boundary in the distribution ADR applies to the built _artifact_: it must run under Node.js and must not depend on `Bun.*` / `bun:*` at runtime. Verifying that with real `npm pack` / `npm install` / `node <built-cli>` — the tools the acceptance criteria name — requires Node.js/npm in CI, not just Bun's npm-compatible tooling.

## Decision

### Publish directory, not the root package

`build:npm` (`bun run scripts/build-npm.ts`, using `Bun.build` — running the build under Bun is explicitly permitted by the distribution ADR) generates a dedicated publish directory, `dist-cli/npm/`, instead of publishing the repository root. `dist-cli/` is a separate top-level, gitignored output root from the browser SPA build's `dist/` (`build.ts`), not nested under it. An earlier version of this decision nested it as `dist/npm/`, sharing the SPA build's output root; that was reconsidered, because `build.ts` wipes the entire `dist/` directory at the start of every SPA build, which would silently delete `dist/npm/` unless `bun run build` always ran before `bun run build:npm` — an implicit ordering dependency between two otherwise-independent build scripts. A separate `dist-cli/` root has no such dependency.

`dist-cli/npm/package.json` is generated from scratch (`scripts/npmPublishDir.ts#buildPublishPackageJson`), not copied from the root manifest: it carries only `name`/`version` (mirrored from root), `description`, `license`, `type`, `bin`, `files` (the full publish file list, see below), `engines.node` (`>=22.0.0`), and repository metadata. It has no `private` field, no SPA dependencies, and no dev scripts. The root `package.json` keeps `private: true` and is never published directly.

`dist-cli/npm/` contents: `package.json`, `README.md`, `LICENSE` (copied from root), and `bin/installerer.js` (the built CLI; see Source map policy below for why no `.map` file ships alongside it). npm always includes `package.json`/`README`/`LICENSE` regardless of the manifest's `files` field, but `buildPublishPackageJson` lists the full publish set (`package.json`, `README.md`, `LICENSE`, `bin/installerer.js`) in `files` explicitly anyway, so the manifest itself is a complete, accurate record of what ships instead of relying on implicit npm defaults (review feedback on PR #97). Nothing under `src/`, `public/`, `test/`, or the rest of `dist/` (the SPA build) is reachable from it.

### Node.js CLI entrypoint layering

The existing runtime-independent core (`src/cli/dispatch.ts`, from issue #86) is unchanged. A new `src/cli/node/` layer adds the Node.js runtime wiring:

- `runNodeCli.ts` calls `dispatchCli` and routes its result to an injectable `NodeCliIO` (`writeStdout` / `writeStderr` / `exit`), defaulting to real `process.*`. Injecting `NodeCliIO` lets tests assert routing without invoking `process.exit` inside the test process.
- `main.ts` is the actual `bin` entrypoint: a two-line file (`runNodeCli(process.argv.slice(2))`) with no injected IO, so it is exercised by spawning it as a real process rather than unit-tested directly.

`src/cli/command.ts` adds `CliCommandModule`, the interface each generator command module (`init` / `generate` / `validate` / `doctor`) is expected to implement so `dispatchCli` can route to it by name. It is not yet consumed by `dispatchCli` — issues #88-#91 wire their own module in and replace the unknown-command fallback for their command name, matching the extension point `dispatch.ts` already documents.

### CLI-scoped tsconfig

`tsconfig.cli.json` extends the root `tsconfig.json` but overrides `lib` to drop `DOM` and `types` to `["node"]` (dropping `bun`/`react`), and scopes `include` to `src/cli/**/*.ts` (excluding `*.test.ts`, which import `bun:test`). `bun run typecheck:cli` (`tsc --noEmit -p tsconfig.cli.json`) verifies the CLI entrypoint's import graph typechecks against Node.js types alone, with no DOM lib and no React/browser module reachable from it.

### Node.js runtime boundary verification

`Bun.build` targets `node` for `src/cli/node/main.ts`, so `node:*` built-in imports (e.g. `node:util` in `dispatch.ts`) stay external instead of being bundled, and the output is plain ESM JavaScript with no Bun-specific runtime dependency. `build:npm` then scans the bundle text for `Bun.` global usage and `bun:` module specifiers (`scripts/npmPublishDir.ts#findBunRuntimeReferences`) and for React/browser UI markers (`findBrowserUiReferences`), failing the build if either is found. `test/integration/npmCli.test.ts` re-asserts both against the generated artifact.

### Source map policy: no source map is shipped

`build:npm` builds with `sourcemap: "none"`; `dist-cli/npm/` does not contain a `bin/installerer.js.map`. The distribution ADR's source map policy only ever said a source map "may" be included for CLI debugging convenience — it was never required — and the safety work that permission implies (rewriting bundler-relative `sources` entries to repo-relative paths, plus scanning the map's full text, including `sourcesContent`, for machine-specific paths and secret/token shapes) is ongoing maintenance surface for a "nice to have." Not shipping a source map removes that surface entirely: there is nothing to sanitize or scan, and no future CLI source file can leak anything through it. Node.js stack traces from the built CLI point at the bundled `bin/installerer.js` itself, which is intentionally close to unminified (no `minify` option is passed to `Bun.build`), so they stay readable without a map. See Alternatives Considered for the sanitize-and-ship approach this replaced.

### `engines.node` and `@types/node`

`engines.node` is `>=22.0.0`. `@types/node` is pinned to `22.20.0` (a version in the same major line, rather than left floating on whatever the workspace's other `@types/node` consumers pull in), so `typecheck:cli` cannot pass by relying on a Node API that does not exist on the oldest Node.js version the package declares support for.

### Real npm/node verification in CI, split by concern

`.github/workflows/ci.yml` verifies the npm package with three additional jobs, on top of `check` (which still runs `just check`, including `build:npm` and the fast in-process checks in `test/integration/npmCli.test.ts`). Each job verifies one concern, so a failure's cause is obvious from which job failed instead of one large matrix mixing "is the artifact well-formed," "does it run on this Node.js version," and "does it install with this package manager":

- **`package-tarball`**: builds the npm package (`bun run build:npm`), verifies its `npm pack --dry-run --json` file set against `PUBLISH_DIR_FILES` and that `bin/installerer.js` keeps its executable bit in the packed tarball (`scripts/ci/verifyPackFileSet.ts`), then runs `npm pack` for real and uploads the `.tgz` as a build artifact. This is the only job that builds; every other job downloads the same uploaded tarball, so all of them verify the exact bytes that would be published, not a re-built copy.
- **`node-runtime-smoke`**: downloads the tarball and, on a matrix of Node.js 22 and 24 (LTS) and 26 (Current), `npm install`s it into a fresh project and runs `./node_modules/.bin/installerer --help`. This is Node.js runtime compatibility only — one package manager (npm), three Node.js versions.
- **`package-manager-smoke`**: downloads the tarball and, on a fixed Node.js version (24), runs one of five package-manager-specific smoke scripts under `scripts/ci/package-manager/` (`npm`, `yarn-pnp`, `yarn-node-modules`, `pnpm`, `bun`) against it. This is package manager install/run compatibility only — one Node.js version, five package managers. Node.js version and package manager are deliberately not crossed in a single matrix: doing so would make a failure's cause ambiguous (is Node 26 broken, or is Yarn PnP broken?) and multiply CI cost for coverage this split does not need — Node.js runtime compatibility is already covered by `node-runtime-smoke`.

`.github/workflows/ci.yml`'s `matrix.include` maps each `package-manager-smoke` entry's `name` directly to its `script` path; the workflow step that runs it (`"${{ matrix.script }}" "$tarball"`) contains no package-manager-specific branching. Each script under `scripts/ci/package-manager/` is a standalone, directly-runnable POSIX `sh` script (`script.sh <tarball-path>`) sharing helpers from `lib.sh`, so a package manager's install/run quirk is isolated to its own script and the same script can be run locally (`./scripts/ci/package-manager/pnpm-smoke.sh ./path/to/package.tgz`) without needing the workflow.

Every `package-manager-smoke` matrix entry installs Corepack explicitly (`npm install -g corepack@latest`) before the smoke script runs, rather than relying on whatever Corepack ships with the job's Node.js install. Node.js versions are dropping bundled Corepack (or bundling one gated behind an opt-in flag) on different schedules; installing it explicitly keeps the Yarn/pnpm scripts from depending on that changing per-Node-version default.

## Alternatives Considered

### Publishing the root package directly

Removing `private: true` from the root `package.json` and publishing it as-is was rejected: it would ship the browser SPA's React/Tailwind dependencies, `wrangler`, dev scripts, and test files as part of the npm CLI package, contradicting the npm publish boundary this issue defines.

### Copying the root `package.json` into `dist-cli/npm/` and stripping fields

Post-processing a copy (deleting `private`, `dependencies`, non-CLI `scripts`, …) was considered instead of building the publish manifest from scratch. Generating it from scratch was selected because it is simpler to reason about and test (`buildPublishPackageJson` is a pure function with an explicit output shape) than an allowlist/denylist over an evolving root manifest.

### Nesting the npm publish directory under the SPA build's `dist/`

An earlier version of this decision generated `dist/npm/`, reasoning that one gitignored top-level build-output directory was simpler than two (review feedback on PR #97). This was reconsidered: `build.ts` (the SPA build) wipes the entire `dist/` directory at the start of every run, so a publish directory nested under it would only survive if `bun run build` always ran before `bun run build:npm`. That is true of `Justfile`'s `_check` today, but it is an implicit, easy-to-violate ordering dependency between two build scripts that have no other reason to depend on each other (e.g. running `bun run build` alone during SPA-only development would silently delete a previously-generated `dist/npm/`). `dist-cli/npm/` avoids the dependency entirely by not sharing a root with `dist/`.

### Shipping a sanitized, scanned source map

Earlier versions of this decision shipped `bin/installerer.js.map` and made it safe: `Bun.build`'s raw `sources` output leaks the machine-specific/worktree-specific absolute directory structure (e.g. `../../../workspaces/installerer/.git/kura/worktrees/81/src/cli/dispatch.ts`), so `sources` entries were rewritten to clean, repo-relative paths, and the map's full serialized text (including `sourcesContent`, which the `sources` rewrite alone does not touch) was scanned for the repo's own absolute checkout path, common home-directory prefixes, and common secret/token/private-key shapes, failing the build if anything was found. This was reconsidered and dropped in favor of not shipping a source map at all (see Decision): sanitizing and scanning is ongoing surface to maintain for a feature the distribution ADR only ever made optional, and pattern-based secret/path scanning can never be a complete guarantee, whereas "no map" has no leak surface by construction.

### Using Bun's npm-compatible tooling instead of real npm/node in CI

An earlier version of this decision used `bun pm pack` / `bun add <tarball>` / `bun <built-cli>` as proxies for `npm pack` / `npm install` / `node <built-cli>`, to avoid adding a second language runtime to this otherwise Bun-only CI pipeline. This was rejected on review: the acceptance criteria name `npm pack`, `npm install`, and `node <built-cli>` specifically, and `bin` shim generation, packed file-mode preservation, and startup behavior are exactly the kind of thing that can differ between Bun's npm-compatible tooling and real npm/Node.js. `actions/setup-node` was added instead so the smoke tests exercise the real toolchain.

### A single `bun:test`-based smoke test covering npm pack, install, and startup

An earlier version of this decision ran the real `npm pack` / `npm install` / `node <built-cli>` verification as a single `bun:test` test in `test/integration/npmCli.test.ts`, only on the one Node.js version and one package manager present in the CI job. This was reconsidered on review: it could not cover multiple Node.js versions in one process, could not cover package managers other than npm without adding them to every developer's local toolchain (since `bun test` also runs locally, not just in CI), and mixed three different concerns — artifact shape, Node.js runtime compatibility, package manager compatibility — into one test, so a failure did not indicate which concern broke. The verification was split into the three dedicated CI jobs described in Decision instead, and `test/integration/npmCli.test.ts` was trimmed to the fast, in-process, toolchain-independent checks (file set, `package.json` shape, shebang/executable bit, Bun/browser-UI boundary, a single `node --help` startup check) that are cheap enough to run on every `bun test`.

### Crossing Node.js version and package manager in one matrix

Putting `node-runtime-smoke` and `package-manager-smoke` into a single job with a matrix of (Node.js version) × (package manager) was considered. This was rejected: `node-version` compatibility is a property of the built artifact and npm alone; package-manager install/run behavior does not meaningfully change across Node.js 22/24/26. Crossing the two would multiply job count for coverage that does not exist (nothing in this package's runtime behavior depends on that combination) and would make a red job ambiguous about which axis broke.

## Consequences

### Positive Consequences

- `dist-cli/npm/` and its generated `package.json` give the npm publish boundary a single, testable definition instead of an implicit "whatever `npm publish` from root would pick up" boundary.
- `runNodeCli`'s injectable IO keeps `process.exit` out of the unit test process while still giving the entrypoint itself full process-IO responsibility, matching the runtime-independent-core boundary from issue #86.
- Not shipping a source map means there is no local-path/secret leak surface in the published package to sanitize, scan, or keep maintaining as the CLI grows.
- `CliCommandModule` gives issues #88-#91 a ready-made extension point instead of each inventing its own module shape.
- `package-tarball` builds and packs the tarball exactly once; `node-runtime-smoke` and `package-manager-smoke` both verify that same uploaded artifact, so what CI verifies is what would actually be published, not a separately-built copy.
- A `node-runtime-smoke` or `package-manager-smoke` failure names its exact cause (a Node.js version, or a package manager) instead of a single mixed job that would need its log read to find out which axis broke.
- Each package-manager smoke script is a standalone, locally-runnable POSIX `sh` script, so reproducing a `package-manager-smoke` CI failure locally does not require reading workflow YAML.

### Negative Consequences

- CI now depends on two language runtimes (Bun and Node.js) instead of one, across four jobs instead of one.
- `dist-cli/npm/package.json`'s field list must be kept in sync by hand as the CLI's needs evolve (e.g. adding a runtime dependency would require updating `buildPublishPackageJson`, not just root `package.json`).
- Node.js stack traces from the installed CLI point at the bundled `bin/installerer.js`, not the original `src/cli/**/*.ts` files; debugging a production npm CLI crash is less convenient than it would be with a source map.
- Five package-manager smoke scripts (`scripts/ci/package-manager/*.sh`) are new surface to maintain, and only `npm-smoke.sh` and `bun-smoke.sh` can be exercised without also installing Yarn/pnpm via Corepack.

### Neutral Consequences

- `CliCommandModule` is unused by `dispatchCli` until issues #88-#91 wire in real command modules.
- `engines.node` (`>=22.0.0`) and `@types/node` (`22.20.0`) both track Node.js 22 as the floor; raising the floor later means updating both together, plus the `node-runtime-smoke` matrix and the `package-manager-smoke` fixed Node.js version.
