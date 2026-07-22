/**
 * Assembles the npm publish directory (`packages/cli/dist/npm/`) for the
 * `installerer` Node.js CLI package: a Node-target bundle of
 * `src/node/main.ts` plus the static `packages/cli/package.json` (with
 * workspace-only fields stripped and `version` sourced from the repository
 * root manifest), `README.md`, and `LICENSE`.
 *
 * CLI package metadata is owned by the static `packages/cli/package.json`
 * (issue #100), except installerer's canonical version, which is owned by the
 * repository root `package.json`. The script itself runs under Bun (the ADR
 * explicitly allows that), but the artifact it produces must not depend on
 * `Bun.*` / `bun:*` at runtime; see
 * docs/adr/20260703T091000Z_cli-distribution-policy.md.
 *
 * Usage: bun run build (from packages/cli or the repository root)
 */
import { chmod, copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  ensureShebang,
  findBrowserUiReferences,
  findBunRuntimeReferences,
  NPM_CLI_BIN_NAME,
  preparePublishManifest,
} from "./npmPublishDir";

const packageRoot = path.dirname(import.meta.dir);
const repoRoot = path.join(packageRoot, "..", "..");
const outDir = path.join(packageRoot, "dist", "npm");
const binDir = path.join(outDir, "bin");
const entrypoint = path.join(packageRoot, "src", "node", "main.ts");
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
    throw new Error("build: bundling src/node/main.ts failed");
  }

  await enforceNodeRuntimeBoundary(bundlePath);
  await writeShebangAndExecutableBit(bundlePath);

  const staticManifest: Record<string, unknown> = await Bun.file(
    path.join(packageRoot, "package.json"),
  ).json();
  const rootManifest: Record<string, unknown> = await Bun.file(
    path.join(repoRoot, "package.json"),
  ).json();
  const canonicalVersion = rootManifest.version;
  if (typeof canonicalVersion !== "string" || canonicalVersion.length === 0) {
    throw new Error("build: root package.json must define a non-empty version string");
  }
  await writeFile(
    path.join(outDir, "package.json"),
    `${JSON.stringify(preparePublishManifest(staticManifest, canonicalVersion), null, 2)}\n`,
  );
  await copyFile(path.join(repoRoot, "README.md"), path.join(outDir, "README.md"));
  await copyFile(path.join(repoRoot, "LICENSE"), path.join(outDir, "LICENSE"));

  console.log(`npm publish directory generated at ${path.relative(repoRoot, outDir)}/`);
}

async function enforceNodeRuntimeBoundary(jsPath: string): Promise<void> {
  const source = await Bun.file(jsPath).text();

  const bunReferences = findBunRuntimeReferences(source);
  if (bunReferences.length > 0) {
    throw new Error(
      `build: npm CLI runtime artifact must not reference Bun runtime APIs, found: ${bunReferences.join(", ")}`,
    );
  }

  const browserUiReferences = findBrowserUiReferences(source);
  if (browserUiReferences.length > 0) {
    throw new Error(
      `build: npm CLI runtime artifact must not import React / browser UI modules, found: ${browserUiReferences.join(", ")}`,
    );
  }
}

async function writeShebangAndExecutableBit(jsPath: string): Promise<void> {
  const source = await Bun.file(jsPath).text();
  await writeFile(jsPath, ensureShebang(source));
  await chmod(jsPath, 0o755);
}

await main();
