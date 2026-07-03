import path from "node:path";

/**
 * Pure helpers for `scripts/build-npm.ts`, split out so the npm publish
 * directory's shape, source map sanitization, and Bun-runtime-reference
 * detection can be unit/integration tested without re-running the bundler.
 */

export const NPM_CLI_BIN_NAME = "installerer.js";
export const NPM_CLI_ENGINES = { node: ">=20.0.0" } as const;

/** Files expected in the generated npm publish directory (`dist-npm/`). */
export const PUBLISH_DIR_FILES = [
  "package.json",
  "README.md",
  "LICENSE",
  `bin/${NPM_CLI_BIN_NAME}`,
  `bin/${NPM_CLI_BIN_NAME}.map`,
] as const;

export const NODE_SHEBANG = "#!/usr/bin/env node\n";

export function ensureShebang(source: string): string {
  return source.startsWith("#!") ? source : NODE_SHEBANG + source;
}

const BUN_GLOBAL_PATTERN = /\bBun\.[A-Za-z_$]/;
const BUN_MODULE_SPECIFIER_PATTERN = /["']bun:[^"']*["']/;

/**
 * Detects `Bun.*` global usage and `bun:*` module specifiers in a built npm
 * CLI runtime artifact. The Node.js runtime boundary (docs/adr/20260703T091000Z)
 * requires the built artifact and its import graph to avoid both, even
 * though `build:npm` itself may run under Bun.
 */
export function findBunRuntimeReferences(source: string): string[] {
  const findings: string[] = [];
  const globalMatch = source.match(BUN_GLOBAL_PATTERN);
  if (globalMatch) findings.push(globalMatch[0]);
  const moduleMatches = source.match(new RegExp(BUN_MODULE_SPECIFIER_PATTERN, "g")) ?? [];
  findings.push(...moduleMatches);
  return findings;
}

const BROWSER_UI_MARKERS = ["react-dom", "react/jsx-runtime", 'from "react"', "from 'react'"];

/** Detects React / browser UI module references leaking into the CLI artifact. */
export function findBrowserUiReferences(source: string): string[] {
  return BROWSER_UI_MARKERS.filter((marker) => source.includes(marker));
}

/**
 * Rewrites a source map's `sources` entries (which the bundler emits
 * relative to the output directory, e.g.
 * `../../../workspaces/installerer/.git/kura/worktrees/81/src/cli/dispatch.ts`)
 * into clean, repo-relative paths (e.g. `src/cli/dispatch.ts`). This drops
 * the machine-specific / worktree-specific directory structure that would
 * otherwise leak into the published package.
 */
export function sanitizeSourceMapSources(
  rawSources: readonly string[],
  outputDir: string,
  repoRoot: string,
): string[] {
  return rawSources.map((rawSource) => {
    const absolute = path.resolve(outputDir, rawSource);
    const relative = path.relative(repoRoot, absolute);
    if (path.isAbsolute(relative) || relative.startsWith("..")) {
      return `external/${path.basename(rawSource)}`;
    }
    return relative.split(path.sep).join("/");
  });
}

/** Throws if any source map `sources` entry still leaks an absolute or parent-relative path. */
export function assertNoLeakedSourcePaths(sources: readonly string[]): void {
  for (const source of sources) {
    if (path.isAbsolute(source) || source.split("/").includes("..")) {
      throw new Error(`npm CLI source map leaks a local path: ${source}`);
    }
  }
}

export type RootPackageJson = {
  name: string;
  version: string;
};

/**
 * Builds the npm-publish-target `package.json`. This is intentionally not a
 * copy of the root `package.json`: the root manifest also carries the
 * browser SPA's dependencies, dev scripts, and `private: true`, none of
 * which belong in the published CLI package (see
 * docs/adr/20260703T091000Z_cli-distribution-policy.md).
 */
export function buildPublishPackageJson(rootPkg: RootPackageJson): Record<string, unknown> {
  return {
    name: rootPkg.name,
    version: rootPkg.version,
    description: "installerer CLI: generate a self-contained install.sh from a JSON config.",
    license: "Apache-2.0",
    type: "module",
    bin: {
      installerer: `./bin/${NPM_CLI_BIN_NAME}`,
    },
    files: ["bin"],
    engines: NPM_CLI_ENGINES,
    repository: {
      type: "git",
      url: "git+https://github.com/tooppoo/installerer.git",
    },
    homepage: "https://github.com/tooppoo/installerer#readme",
    bugs: {
      url: "https://github.com/tooppoo/installerer/issues",
    },
    keywords: ["installer", "cli", "installerer", "install.sh"],
  };
}
