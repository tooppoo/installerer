import { beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  findBrowserUiReferences,
  findBunRuntimeReferences,
  NODE_SHEBANG,
  PUBLISH_DIR_FILES,
} from "../../scripts/npmPublishDir";

/**
 * Covers the npm publish boundary from issue #81: `bun run build:npm` must
 * produce a self-contained, Node.js-runnable publish directory that
 * excludes the browser SPA build, tests, and dev-only files, and that a
 * packed tarball actually installs and runs.
 *
 * Node.js/npm are not part of this repo's toolchain (only Bun is set up in
 * CI, see .github/workflows/ci.yml), so `bun pm pack` / `bun add <tarball>`
 * / `bun <built-cli>` stand in for `npm pack` / `npm install` / `node
 * <built-cli>`: Bun implements the same node: builtins the built artifact
 * uses, so it is a faithful proxy for Node.js here.
 */

const root = join(import.meta.dir, "..", "..");
const outDir = join(root, "dist-npm");
const binPath = join(outDir, "bin", "installerer.js");
const mapPath = join(outDir, "bin", "installerer.js.map");

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
    expect(pkg.files).toEqual(["bin"]);
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

  test("source map sources are repo-relative, with no absolute or machine-specific paths", () => {
    const map = JSON.parse(readFileSync(mapPath, "utf8"));
    const sources = map.sources as string[];
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(source.startsWith("/")).toBe(false);
      expect(source.split("/")).not.toContain("..");
      expect(source).not.toContain(root);
    }
  });

  test("bin entry starts up and prints help under a Node-compatible runtime", () => {
    const result = run("bun", [binPath, "--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("installerer <command> [options]");
    expect(result.stderr).toBe("");
  });

  test("`bun pm pack --dry-run` reports exactly the expected files", () => {
    const result = run("bun", ["pm", "pack", "--dry-run"], { cwd: outDir });
    expect(result.status).toBe(0);
    const packed = [...result.stdout.matchAll(/^packed\s+\S+\s+(.+)$/gm)].map((match) => match[1]);
    expect(packed.sort()).toEqual([...PUBLISH_DIR_FILES].sort());
  });

  test("a packed tarball installs into a fresh project and the installed bin runs", () => {
    const tarballDir = mkdtempSync(join(tmpdir(), "installerer-npm-pack-"));
    const installDir = mkdtempSync(join(tmpdir(), "installerer-npm-install-"));
    try {
      const pack = run("bun", ["pm", "pack", "--destination", tarballDir, "--quiet"], {
        cwd: outDir,
      });
      expect(pack.status).toBe(0);

      const tarballName = readdirSync(tarballDir).find((name) => name.endsWith(".tgz"));
      if (!tarballName) throw new Error("bun pm pack did not produce a .tgz file");
      const tarballPath = join(tarballDir, tarballName);

      writeFileSync(
        join(installDir, "package.json"),
        JSON.stringify({ name: "npm-cli-smoke-test", private: true }),
      );
      const install = run("bun", ["add", tarballPath], { cwd: installDir });
      expect(install.status).toBe(0);

      const installedBin = join(
        installDir,
        "node_modules",
        "@philomagi",
        "installerer",
        "bin",
        "installerer.js",
      );
      const smoke = run("bun", [installedBin, "--help"]);
      expect(smoke.status).toBe(0);
      expect(smoke.stdout).toContain("installerer <command> [options]");
    } finally {
      rmSync(tarballDir, { recursive: true, force: true });
      rmSync(installDir, { recursive: true, force: true });
    }
  }, 30_000);
});
