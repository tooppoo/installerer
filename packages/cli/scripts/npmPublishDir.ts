/**
 * Pure helpers for `packages/cli/scripts/build-npm.ts`, split out so the npm
 * publish directory's shape and Bun-runtime-reference detection can be
 * unit/integration tested without re-running the bundler.
 */

export const NPM_CLI_BIN_NAME = "installerer.js";

/**
 * Files expected in the assembled npm publish directory
 * (`packages/cli/dist/npm/`). No source map is shipped: see
 * docs/adr/20260703T134302Z_npm-node-cli-package.md.
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

/**
 * Workspace-only fields removed from the static `packages/cli/package.json`
 * when it is copied into the publish directory. CLI package metadata is
 * owned by that static file (issue #100); this preparation step only strips
 * fields that are meaningless outside the workspace — it must never add or
 * rewrite metadata.
 *
 * - `$schema`: editor tooling hint, not package metadata.
 * - `scripts`: workspace build orchestration; nothing runs them in the
 *   published package.
 * - `devDependencies`: contains the `workspace:*` reference to
 *   @installerer/core, which is bundled into the bin artifact at build time
 *   and never installed by consumers.
 */
const WORKSPACE_ONLY_MANIFEST_FIELDS = ["$schema", "scripts", "devDependencies"] as const;

export function preparePublishManifest(
  staticManifest: Record<string, unknown>,
): Record<string, unknown> {
  const manifest = { ...staticManifest };
  for (const field of WORKSPACE_ONLY_MANIFEST_FIELDS) {
    delete manifest[field];
  }
  return manifest;
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
// substring. `packages/cli/src/version.ts` statically imports the CLI
// `package.json` for its `version` field, and Bun.build inlines that whole
// JSON object into the bundle, so a bare `source.includes(...)` check would
// false-positive on JSON keys that merely mention a module name.
const BROWSER_UI_SPECIFIER_PATTERN =
  /\b(?:from|import|require)\s*\(?\s*["'](react-dom|react)(?:\/[^"']*)?["']/;

/** Detects React / browser UI module references leaking into the CLI artifact. */
export function findBrowserUiReferences(source: string): string[] {
  return source.match(new RegExp(BROWSER_UI_SPECIFIER_PATTERN, "g")) ?? [];
}
