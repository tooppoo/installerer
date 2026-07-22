import { beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  findBrowserUiReferences,
  findBunRuntimeReferences,
  NODE_SHEBANG,
  PUBLISH_DIR_FILES,
} from "../scripts/npmPublishDir";

/**
 * Fast, in-process checks on the npm publish boundary from issue #81:
 * `bun run build` must produce a self-contained, Node.js-runnable
 * `packages/cli/dist/npm/` directory that excludes the browser SPA build,
 * tests, and dev-only files.
 *
 * Real `npm pack` / `npm install` / `node` verification, across Node.js
 * versions and package managers, runs as dedicated GitHub Actions jobs
 * instead of here (`package-tarball`, `node-runtime-smoke`,
 * `package-manager-smoke` in .github/workflows/ci.yml) — see
 * docs/adr/20260703T134302Z_npm-node-cli-package.md. Keeping this suite
 * in-process (only a single `node --help` smoke check) means it runs on
 * every `bun test`, not just in CI.
 */

const packageRoot = join(import.meta.dir, "..");
const repoRoot = join(packageRoot, "..", "..");
const outDir = join(packageRoot, "dist", "npm");
const binPath = join(outDir, "bin", "installerer.js");

function run(command: string, args: string[], options: { cwd?: string } = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd ?? packageRoot, encoding: "utf8" });
  if (result.error) throw result.error;
  return result;
}

function listFilesRecursive(dir: string, base = dir): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(full, base));
    } else {
      files.push(full.slice(base.length + 1));
    }
  }
  return files;
}

describe("npm CLI publish directory (build)", () => {
  beforeAll(() => {
    const build = run("bun", ["run", "build"]);
    if (build.status !== 0) {
      throw new Error(`bun run build failed:\n${build.stdout}\n${build.stderr}`);
    }
  }, 60_000);

  test("generates exactly the expected publish file set", () => {
    const actual = listFilesRecursive(outDir).sort();
    expect(actual).toEqual([...PUBLISH_DIR_FILES].sort());
  });

  test("package.json is publish-ready: no private flag, has bin/engines/files", () => {
    const pkg = JSON.parse(readFileSync(join(outDir, "package.json"), "utf8"));
    expect(pkg.name).toBe("@philomagi/installerer");
    expect(pkg.private).toBeUndefined();
    expect(pkg.scripts).toBeUndefined();
    expect(pkg.devDependencies).toBeUndefined();
    expect(pkg.bin).toEqual({ installerer: "./bin/installerer.js" });
    expect(pkg.files).toEqual([...PUBLISH_DIR_FILES]);
    expect(pkg.engines?.node).toBeTruthy();
  });

  test("publish manifest metadata comes from static package metadata and root version", () => {
    const staticPkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
    const rootPkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
    const publishedPkg = JSON.parse(readFileSync(join(outDir, "package.json"), "utf8"));
    for (const field of ["name", "bin", "files", "engines", "description"]) {
      expect(publishedPkg[field]).toEqual(staticPkg[field]);
    }
    expect(publishedPkg.version).toBe(rootPkg.version);
    // `files` in the static manifest is the same single source of truth the
    // pack-file-set check uses.
    expect(staticPkg.files).toEqual([...PUBLISH_DIR_FILES]);
  });

  test("bin entry has a node shebang and the executable bit", () => {
    const source = readFileSync(binPath, "utf8");
    expect(source.startsWith(NODE_SHEBANG)).toBe(true);

    const mode = statSync(binPath).mode;
    expect(mode & 0o111).not.toBe(0);
  });

  test("bin entry does not reference Bun runtime APIs or browser UI modules", () => {
    const source = readFileSync(binPath, "utf8");
    expect(findBunRuntimeReferences(source)).toEqual([]);
    expect(findBrowserUiReferences(source)).toEqual([]);
  });

  test("bin entry starts up and prints help under Node.js", () => {
    const result = run("node", [binPath, "--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("installerer <command> [options]");
    expect(result.stderr).toBe("");
  });
});
