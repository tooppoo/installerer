# Bun Workspace Monorepo with Explicit Web / Core / CLI Package Boundaries

- Status: Accepted
- Created: 2026-07-03T23:12:05Z

## Context

[Issue #100](https://github.com/tooppoo/installerer/issues/100) restructures the repository ahead of full CLI support (issues #88-#91). CLI support introduces package metadata, dependency management, Node-specific APIs, standard streams, exit codes, and a distribution boundary of its own — none of which belong in the Web app or in the shared installer generation logic.

Before this decision, everything lived in one root package: `src/` mixed browser UI (`App.tsx`, `frontend.tsx`), the runtime-independent CLI core (`src/cli/`), and the shared generator (`src/generatedInstaller/`, `src/runtimeDependencies/`, config validation). The root `package.json` owned React, Tailwind, and Wrangler alongside CLI-adjacent tooling, and `build:npm` generated the published CLI `package.json` from scratch at build time ([docs/adr/20260703T134302Z_npm-node-cli-package.md](./20260703T134302Z_npm-node-cli-package.md)). That build-time metadata generation weakened dependency ownership, reviewability, and reproducibility: the manifest that ships to npm never existed as a reviewable file in the repository.

Boundary discipline existed only as convention plus spot checks (a directory-local oxlint config for `src/generatedInstaller/`, a bundle-text scan in `build:npm`). Nothing mechanically prevented the Web app from importing CLI code, or the shared generator from quietly acquiring a Node or browser dependency.

## Decision

### Bun workspace monorepo, three packages

The repository is a Bun workspace-based monorepo (root `package.json` `workspaces: ["apps/*", "packages/*"]`, single root `bun.lock`):

```txt
apps/web        @installerer/web        (private) browser UI, dev server, SPA build, Wrangler deployment
packages/core   @installerer/core       (private) shared domain model, validation, normalization, installer generation
packages/cli    @philomagi/installerer  CLI entrypoint, argv parsing, Node runtime wiring, CLI package metadata
```

The repository package manager stays Bun and the lockfile stays `bun.lock`; no `yarn.lock` is introduced. Package-manager migration is explicitly out of scope: this Issue is about package boundaries, and mixing a package-manager migration into it would multiply the review surface and entangle two unrelated risks. The published npm package's compatibility with other package managers is already verified by the `package-manager-smoke` CI jobs, independent of what manages this repository.

`apps/web` (not `app/web`) follows the prevailing monorepo convention (`apps/` + `packages/`), keeps the door open for additional apps without a rename, and matches the plural `packages/`.

The initial layout is exactly these three packages. `packages/config` (a separate package for KDL config handling) is **not** introduced; whether it should exist at all is deferred to [Issue #99](https://github.com/tooppoo/installerer/issues/99). Creating it now would prejudge that design discussion, and an unneeded package is harder to remove than to add.

### Dependency direction

```txt
allowed:    apps/web  -> packages/core
            packages/cli -> packages/core
forbidden:  packages/core -> anything in this repository
            apps/web <-> packages/cli (either direction)
```

Dependency ownership:

- Web-only dependencies (React, Tailwind, Wrangler, `bun-plugin-tailwind`) are owned by `apps/web/package.json`.
- CLI-only dependencies are owned by `packages/cli/package.json`.
- Shared runtime dependencies, if any ever appear, are owned by `packages/core/package.json` (it currently has none).
- The root `package.json` holds only repository-level tooling (TypeScript, oxlint, oxfmt, changesets, license-checker) and orchestration scripts that delegate into packages (`bun run --cwd apps/web ...`).

### `packages/core` is runtime-neutral

`packages/core` must not import or depend on Node-specific APIs (`fs`, `path`, `process`, `child_process`, `os`, `stream`, `crypto`, any `node:*`), Bun-specific APIs (`Bun`, `bun:*`), browser globals (`window`, `document`, `navigator`, `localStorage`, `sessionStorage`), React, or Web UI modules.

Runtime-neutral is a stronger requirement than "browser-compatible" on purpose. The same generation logic must run in a browser (apps/web), under Node.js (the published CLI), and under Bun (tests, a future compiled executable). "Browser-compatible" would still permit browser globals, which would break the CLI; "Node-compatible" would still permit `process.env` reads, which would break the browser and reintroduce exactly the implicit-input problem [docs/adr/20260703T144753Z_generator-version-injection-boundary.md](./20260703T144753Z_generator-version-injection-boundary.md) removed. Neutral means the core is a pure `input -> output` library: every environment-derived value arrives as an explicit parameter.

Core unit tests (`*.test.ts`, `packages/core/test/`) are exempt: they run under `bun test` by definition and may spawn processes, touch the filesystem, and import `bun:test`. The restriction protects what ships, not how it is tested.

### Static CLI package metadata

`packages/cli/package.json` is a static, reviewable file containing the published CLI metadata (`name`, `version`, `bin`, `files`, `engines`, repository metadata). The normal build/test flow never generates a CLI `package.json` from scratch. `build:npm` (now `packages/cli/scripts/build-npm.ts`) assembles the publish directory `packages/cli/dist/npm/` by bundling `src/node/main.ts` and **copying** the static manifest, stripping only workspace-only fields (`$schema`, `scripts`, `devDependencies` — the latter holds the `workspace:*` reference to `@installerer/core`, which is bundled into the bin artifact and never installed by consumers). Stripping is a mechanical projection of the static file, not metadata construction; a test asserts the published manifest's identifying fields are verbatim-equal to the static file's.

This restores the property the generated-manifest approach lost: the manifest that ships is diffable in review, changes to it appear in PRs, and `version` is bumpable by standard tooling (changesets) instead of being mirrored from the root at build time. The CLI version source ([docs/adr/20260703T133536Z_cli-version-source.md](./20260703T133536Z_cli-version-source.md)) is unchanged in principle but re-anchored: `packages/cli/src/version.ts` statically imports its own package's `package.json`, which is now also the published manifest — removing even the root-to-publish mirroring step.

The publish directory moved from the repository-root `dist-cli/npm/` to `packages/cli/dist/npm/` because CLI build artifacts are owned by the CLI package. The original motivation for a separate top-level `dist-cli/` — the SPA build wiping `dist/` — no longer applies, since the SPA now builds into `apps/web/dist/`.

### Web build support files live in `apps/web`

`build.ts`, `wrangler.jsonc`, the dev-server `bunfig.toml` (`[serve.static]`), `bun-env.d.ts`, `public/`, and the installer-contract module generator (`apps/web/scripts/generate-installer-contract.ts`) move under `apps/web`. The Web package owns Web source, static assets, Web-only runtime dependencies, and Web-only build configuration; root scripts (`bun run build` / `dev` / `preview` / `deploy`) remain as convenience delegation (`bun run --cwd apps/web ...`) but own no Web build configuration. This makes "what does deploying the Web app depend on?" answerable by reading one directory.

Repository-level files that are not Web-only stay at the root: `docs/` (including `docs/installer-contract.md`, the source the Web generator reads), `THIRD_PARTY_LICENSES.txt`, and `scripts/get-revision.sh`.

### Mechanical boundary enforcement

Violations are detected by machines, not review vigilance, in three layers:

1. **oxlint** (the project's primary linter — no ESLint is introduced): package-scoped `.oxlintrc.json` files use `no-restricted-imports` / `no-restricted-globals` to reject Node builtins, Bun APIs, React, browser globals, and cross-package imports in `packages/core`; CLI imports in `apps/web`; and Web/React imports in `packages/cli`. The previous `src/generatedInstaller/.oxlintrc.json` rules (no `package.json` import, no CLI import) are folded into `packages/core/.oxlintrc.json` as an override so they stack with the package-wide rules.
2. **A repository-local boundary check** (`scripts/ci/check-package-boundaries.ts`, `bun run check:boundaries`): oxlint's restricted-import rules do not reliably cover dynamic `import()` and CommonJS `require()` specifiers, so a small script scans all specifier forms in each package's `src/`, rejects relative imports that escape their own package directory, and checks `package.json` dependency direction. Per the Issue's decision, this is preferred over adopting ESLint as a second primary linter for one rule family.
3. **Package-scoped typecheck** (see below) — a core module that references `process` or `document` fails `tsc` because no ambient type for it exists.

CI runs all three: `just check` now includes `bun run lint`, `bun run check:boundaries`, and `bun run typecheck` (which fans out to every package).

### Package-scoped TypeScript configs

A root `tsconfig.base.json` holds shared strictness options and deliberately defines no `lib`, `types`, or `paths`. Each package extends it:

- `packages/core/tsconfig.json`: `lib: ["ESNext"]`, `types: []` — core source typechecks with no DOM, no Node, no Bun, no React ambient types at all. A separate `tsconfig.test.json` adds `types: ["bun"]` for tests only.
- `packages/cli/tsconfig.json`: `types: ["node"]` for runtime source (the artifact runs under Node.js); `tsconfig.test.json` adds Bun types for tests and the Bun-run packaging scripts.
- `apps/web/tsconfig.json`: `lib: ["ESNext", "DOM"]`, `jsx: react-jsx`, `types: ["bun", "react"]`.

The old root-level `@/* -> ./src/*` path alias is removed and no repository-wide alias replaces it. A root-wide alias would resolve any file from any package, hiding cross-package imports from both the compiler and reviewers; cross-package imports must instead go through the package name (`@installerer/core`, resolved via its `exports` map), which is exactly what the lint rules and boundary check can see and reject. Ambient type leakage is prevented structurally: a package can only see the globals its own tsconfig declares.

## Alternatives Considered

### Keep the single-package layout and rely on lint rules alone

Directory-scoped lint rules inside one package (the pre-existing `src/generatedInstaller/.oxlintrc.json` pattern, extended) could restrict imports without moving files. Rejected: it leaves dependency ownership unsolved — one `package.json` still owns React, Wrangler, and future CLI dependencies together, so "what does the CLI pull in?" stays unanswerable, and the published CLI manifest still has to be generated because the root manifest is unpublishable. Lint rules also cannot give `packages/core` a typecheck with no Node/DOM ambient globals while the same tsconfig serves the Web app.

### Migrate to Yarn/pnpm workspaces as part of this change

Rejected as out of scope. Bun workspaces satisfy every requirement here (workspace protocol, per-package manifests, hoisted installs), the toolchain is already Bun end-to-end (`bun test`, `Bun.build`, `bun --hot`), and a package-manager migration has its own risk surface (lockfile semantics, CI caching, contributor setup) that deserves its own issue if it is ever wanted.

### Introduce ESLint for dependency-graph rules (e.g. `import/no-restricted-paths`)

ESLint's plugin ecosystem has richer dependency-graph rules than oxlint. Rejected per the Issue's explicit decision: running two primary linters doubles configuration and CI surface and reintroduces the lint-speed problem oxlint was chosen to solve. The gap between oxlint's coverage and what the boundaries need (dynamic import / require specifiers, package.json direction) is small enough that a ~200-line repository-local script closes it.

### Keep generating the publish `package.json`, but from a checked-in template

A template would make the metadata partially reviewable while keeping the generation step. Rejected: it keeps two artifacts (template + generator output) where one suffices, and the generator remains a place where metadata can silently diverge from what review approved. A static manifest with a strip-only projection has no such gap.

### `packages/core` as "browser-compatible" instead of runtime-neutral

Rejected because browser-compatibility still admits browser globals and ambient DOM types, which the CLI cannot run against, and it invites `typeof window` branching inside shared logic. Runtime-neutral keeps the core a pure library and makes every environment dependency an explicit, testable parameter (the same reasoning as docs/adr/20260703T144753Z, generalized from `process.env` to all runtimes).

## Consequences

### Positive Consequences

- Web, core, and CLI dependencies are owned by the package that uses them; adding a CLI dependency can no longer silently affect the Web build, and vice versa.
- The published CLI manifest is a reviewable, diffable file; publish output is reproducible from the repository state alone.
- `packages/core`'s runtime-neutrality is enforced by three independent mechanisms (lint, boundary script, ambient-type-free typecheck), so a violation cannot land without deliberately disabling checks.
- Future work (#99 config package, #88-#91 CLI commands, #82 compiled executable) has an obvious home and an enforced contract for what it may import.

### Negative Consequences

- More manifests and tsconfigs to maintain (4 `package.json`, 6 tsconfig files vs. 1 + 2 before).
- Cross-package imports are more verbose (`@installerer/core/...` instead of `./...`), and moving a module between packages is now a visible, breaking refactor rather than a file move.
- The boundary-check script is repository-local code that must be maintained as import patterns evolve (accepted trade-off vs. adopting ESLint).
- Workspace `devDependencies` with `workspace:*` protocol appear in `packages/cli/package.json` and must be stripped at publish time; forgetting the strip step would produce an uninstallable manifest (guarded by tests on the publish directory).

### Neutral Consequences

- Root `bun run build/dev/preview/deploy/build:npm` keep working via delegation, so CI (`just check`) and contributor muscle memory are unchanged.
- `bun test` from the root still discovers and runs every package's tests with the root coverage configuration.
- [docs/adr/20260703T134302Z_npm-node-cli-package.md](./20260703T134302Z_npm-node-cli-package.md) is amended by this ADR (generated manifest → static manifest; `dist-cli/npm/` → `packages/cli/dist/npm/`); its CI-verification, entrypoint-layering, and source-map decisions stand. [docs/adr/20260703T133536Z_cli-version-source.md](./20260703T133536Z_cli-version-source.md) is amended on the version-source location (root `package.json` → `packages/cli/package.json`); its single-source/static-import principle stands.
