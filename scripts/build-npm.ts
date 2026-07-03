/**
 * Generates the npm publish directory (`dist-npm/`) for the `installerer`
 * Node.js CLI package: a Node-target bundle of `src/cli/node/main.ts` plus a
 * publish-only `package.json`, `README.md`, and `LICENSE`.
 *
 * This script itself runs under Bun (the ADR explicitly allows that), but
 * the artifact it produces must not depend on `Bun.*` / `bun:*` at runtime;
 * see docs/adr/20260703T091000Z_cli-distribution-policy.md.
 *
 * Usage: bun run build:npm
 */
import { chmod, copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  assertNoLeakedSourcePaths,
  buildPublishPackageJson,
  ensureShebang,
  findBrowserUiReferences,
  findBunRuntimeReferences,
  NPM_CLI_BIN_NAME,
  sanitizeSourceMapSources,
  type RootPackageJson,
} from "./npmPublishDir";

const root = path.dirname(import.meta.dir);
const outDir = path.join(root, "dist-npm");
const binDir = path.join(outDir, "bin");
const entrypoint = path.join(root, "src", "cli", "node", "main.ts");
const bundlePath = path.join(binDir, NPM_CLI_BIN_NAME);
const sourceMapPath = `${bundlePath}.map`;

async function main() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(binDir, { recursive: true });

  const result = await Bun.build({
    entrypoints: [entrypoint],
    outdir: binDir,
    target: "node",
    format: "esm",
    sourcemap: "linked",
    naming: NPM_CLI_BIN_NAME,
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error("build:npm: bundling src/cli/node/main.ts failed");
  }

  await enforceNodeRuntimeBoundary(bundlePath);
  await writeShebangAndExecutableBit(bundlePath);
  await sanitizeSourceMap(sourceMapPath);

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

async function sanitizeSourceMap(mapPath: string): Promise<void> {
  const map = await Bun.file(mapPath).json();
  const sources = sanitizeSourceMapSources(map.sources ?? [], binDir, root);
  assertNoLeakedSourcePaths(sources);
  await writeFile(mapPath, JSON.stringify({ ...map, sources }));
}

await main();
