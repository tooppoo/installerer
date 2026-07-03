import { beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  findBrowserUiReferences,
  findBunRuntimeReferences,
  NODE_SHEBANG,
  PUBLISH_DIR_FILES,
} from "../../scripts/npmPublishDir";

/**
 * Fast, in-process checks on the npm publish boundary from issue #81:
 * `bun run build:npm` must produce a self-contained, Node.js-runnable
 * `dist/npm/` directory that excludes the browser SPA build, tests, and
 * dev-only files.
 *
 * Real `npm pack` / `npm install` / `node` verification, across Node.js
 * versions and package managers, runs as dedicated GitHub Actions jobs
 * instead of here (`package-tarball`, `node-runtime-smoke`,
 * `package-manager-smoke` in .github/workflows/ci.yml) — see
 * docs/adr/20260703T134302Z_npm-node-cli-package.md. Keeping this suite
 * in-process (only a single `node --help` smoke check) means it runs on
 * every `bun test`, not just in CI.
 */

const root = join(import.meta.dir, "..", "..");
const outDir = join(root, "dist", "npm");
const binPath = join(outDir, "bin", "installerer.js");

function run(command: string, args: string[], options: { cwd?: string } = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd ?? root, encoding: "utf8" });
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

describe("npm CLI publish directory (build:npm)", () => {
  beforeAll(() => {
    const build = run("bun", ["run", "build:npm"]);
    if (build.status !== 0) {
      throw new Error(`bun run build:npm failed:\n${build.stdout}\n${build.stderr}`);
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
    expect(pkg.bin).toEqual({ installerer: "./bin/installerer.js" });
    expect(pkg.files).toEqual([...PUBLISH_DIR_FILES]);
    expect(pkg.engines?.node).toBeTruthy();
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
