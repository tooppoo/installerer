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
 * packed tarball actually installs and runs under real `npm` / `node` (CI
 * installs Node.js via actions/setup-node in .github/workflows/ci.yml
 * specifically so this suite can exercise the real toolchain, not a Bun
 * proxy for it).
 */

const root = join(import.meta.dir, "..", "..");
const outDir = join(root, "dist-npm");
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

type NpmPackDryRunEntry = {
  files: { path: string; mode: number }[];
};

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

  test("bin entry starts up and prints help under Node.js", () => {
    const result = run("node", [binPath, "--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("installerer <command> [options]");
    expect(result.stderr).toBe("");
  });

  test("`npm pack --dry-run` reports exactly the expected files with the executable bit preserved", () => {
    const result = run("npm", ["pack", "--dry-run", "--json"], { cwd: outDir });
    expect(result.status).toBe(0);

    const [entry] = JSON.parse(result.stdout) as NpmPackDryRunEntry[];
    const packed = (entry?.files ?? []).map((file) => file.path);
    expect(packed.sort()).toEqual([...PUBLISH_DIR_FILES].sort());

    const bin = entry?.files.find((file) => file.path === "bin/installerer.js");
    expect((bin?.mode ?? 0) & 0o111).not.toBe(0);
  });

  test("a packed tarball installs into a fresh project via real npm, and both `node <bin>` and the npm-generated bin shim run it", () => {
    const tarballDir = mkdtempSync(join(tmpdir(), "installerer-npm-pack-"));
    const installDir = mkdtempSync(join(tmpdir(), "installerer-npm-install-"));
    try {
      const pack = run("npm", ["pack", "--pack-destination", tarballDir, "--silent"], {
        cwd: outDir,
      });
      expect(pack.status).toBe(0);

      const tarballName = readdirSync(tarballDir).find((name) => name.endsWith(".tgz"));
      if (!tarballName) throw new Error("npm pack did not produce a .tgz file");
      const tarballPath = join(tarballDir, tarballName);

      writeFileSync(
        join(installDir, "package.json"),
        JSON.stringify({ name: "npm-cli-smoke-test", private: true }),
      );
      const install = run("npm", ["install", "--no-audit", "--no-fund", tarballPath], {
        cwd: installDir,
      });
      expect(install.status).toBe(0);

      const installedBin = join(
        installDir,
        "node_modules",
        "@philomagi",
        "installerer",
        "bin",
        "installerer.js",
      );
      const direct = run("node", [installedBin, "--help"]);
      expect(direct.status).toBe(0);
      expect(direct.stdout).toContain("installerer <command> [options]");

      // The user-facing path documented in README.md: after
      // `npm install [-g] @philomagi/installerer`, the `installerer`
      // command itself (npm's generated bin shim) must work, not just
      // `node <path-to-bundle>`.
      const shimPath = join(installDir, "node_modules", ".bin", "installerer");
      const shim = run(shimPath, ["--help"]);
      expect(shim.status).toBe(0);
      expect(shim.stdout).toContain("installerer <command> [options]");
    } finally {
      rmSync(tarballDir, { recursive: true, force: true });
      rmSync(installDir, { recursive: true, force: true });
    }
  }, 30_000);
});
