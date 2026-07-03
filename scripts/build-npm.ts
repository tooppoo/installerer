/**
 * Generates the npm publish directory (`dist/npm/`) for the `installerer`
 * Node.js CLI package: a Node-target bundle of `src/cli/node/main.ts` plus a
 * publish-only `package.json`, `README.md`, and `LICENSE`.
 *
 * This script itself runs under Bun (the ADR explicitly allows that), but
 * the artifact it produces must not depend on `Bun.*` / `bun:*` at runtime;
 * see docs/adr/20260703T091000Z_cli-distribution-policy.md.
 *
 * `dist/npm/` lives under the same top-level `dist/` as the browser SPA
 * build (`build.ts`), so both build outputs share one gitignored root
 * instead of two (review feedback on PR #97). `build.ts` wipes the whole
 * `dist/` directory at the start of every SPA build, so `just check` (and
 * any other script) must run `bun run build` before `bun run build:npm`,
 * not after, or the npm publish directory would be deleted along with it.
 *
 * Usage: bun run build:npm
 */
import { chmod, copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildPublishPackageJson,
  ensureShebang,
  findBrowserUiReferences,
  findBunRuntimeReferences,
  NPM_CLI_BIN_NAME,
  type RootPackageJson,
} from "./npmPublishDir";

const root = path.dirname(import.meta.dir);
const outDir = path.join(root, "dist", "npm");
const binDir = path.join(outDir, "bin");
const entrypoint = path.join(root, "src", "cli", "node", "main.ts");
const bundlePath = path.join(binDir, NPM_CLI_BIN_NAME);

async function main() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(binDir, { recursive: true });

  const result = await Bun.build({
    entrypoints: [entrypoint],
    outdir: binDir,
    target: "node",
    format: "esm",
    sourcemap: "none",
    naming: NPM_CLI_BIN_NAME,
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error("build:npm: bundling src/cli/node/main.ts failed");
  }

  await enforceNodeRuntimeBoundary(bundlePath);
  await writeShebangAndExecutableBit(bundlePath);

  const rootPkg: RootPackageJson = await Bun.file(path.join(root, "package.json")).json();
  await writeFile(
    path.join(outDir, "package.json"),
    `${JSON.stringify(buildPublishPackageJson(rootPkg), null, 2)}\n`,
  );
  await copyFile(path.join(root, "README.md"), path.join(outDir, "README.md"));
  await copyFile(path.join(root, "LICENSE"), path.join(outDir, "LICENSE"));

  console.log(`npm publish directory generated at ${path.relative(root, outDir)}/`);
}

async function enforceNodeRuntimeBoundary(jsPath: string): Promise<void> {
  const source = await Bun.file(jsPath).text();

  const bunReferences = findBunRuntimeReferences(source);
  if (bunReferences.length > 0) {
    throw new Error(
      `build:npm: npm CLI runtime artifact must not reference Bun runtime APIs, found: ${bunReferences.join(", ")}`,
    );
  }

  const browserUiReferences = findBrowserUiReferences(source);
  if (browserUiReferences.length > 0) {
    throw new Error(
      `build:npm: npm CLI runtime artifact must not import React / browser UI modules, found: ${browserUiReferences.join(", ")}`,
    );
  }
}

async function writeShebangAndExecutableBit(jsPath: string): Promise<void> {
  const source = await Bun.file(jsPath).text();
  await writeFile(jsPath, ensureShebang(source));
  await chmod(jsPath, 0o755);
}

await main();
