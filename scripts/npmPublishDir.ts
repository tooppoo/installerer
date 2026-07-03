/**
 * Pure helpers for `scripts/build-npm.ts`, split out so the npm publish
 * directory's shape and Bun-runtime-reference detection can be
 * unit/integration tested without re-running the bundler.
 */

export const NPM_CLI_BIN_NAME = "installerer.js";
export const NPM_CLI_ENGINES = { node: ">=20.0.0" } as const;

/**
 * Files expected in the generated npm publish directory (`dist-npm/`).
 * No source map is shipped: see docs/adr/20260703T134302Z_npm-node-cli-package.md.
 */
export const PUBLISH_DIR_FILES = [
  "package.json",
  "README.md",
  "LICENSE",
  `bin/${NPM_CLI_BIN_NAME}`,
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

// Matches only real import/require specifiers (`from "react-dom"`,
// `import("react/jsx-runtime")`, `require("react")`, …), not a bare
// substring. `src/cli/version.ts` statically imports the root `package.json`
// for its `version` field, and Bun.build inlines that whole JSON object
// (including its `dependencies` map) into the bundle, so a bare
// `source.includes("react-dom")` check false-positives on the JSON key
// `"react-dom": "^19"`, which is not an import.
const BROWSER_UI_SPECIFIER_PATTERN =
  /\b(?:from|import|require)\s*\(?\s*["'](react-dom|react)(?:\/[^"']*)?["']/;

/** Detects React / browser UI module references leaking into the CLI artifact. */
export function findBrowserUiReferences(source: string): string[] {
  return source.match(new RegExp(BROWSER_UI_SPECIFIER_PATTERN, "g")) ?? [];
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
