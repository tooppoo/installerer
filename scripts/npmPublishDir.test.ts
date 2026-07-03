import { describe, expect, test } from "bun:test";

import {
  assertNoLeakedSourcePaths,
  buildPublishPackageJson,
  ensureShebang,
  findBrowserUiReferences,
  findBunRuntimeReferences,
  findMachineSpecificPathLeaks,
  findSecretLeaks,
  NODE_SHEBANG,
  NPM_CLI_ENGINES,
  sanitizeSourceMapSources,
} from "./npmPublishDir";

describe("ensureShebang", () => {
  test("prepends the node shebang when missing", () => {
    expect(ensureShebang("console.log(1);\n")).toBe(`${NODE_SHEBANG}console.log(1);\n`);
  });

  test("leaves an existing shebang untouched", () => {
    const source = "#!/usr/bin/env node\nconsole.log(1);\n";
    expect(ensureShebang(source)).toBe(source);
  });
});

describe("findBunRuntimeReferences", () => {
  test("detects Bun global usage", () => {
    expect(findBunRuntimeReferences('const f = Bun.file("x");')).toEqual(["Bun.f"]);
  });

  test("detects bun: module specifiers", () => {
    expect(findBunRuntimeReferences('import { spawn } from "bun:test";')).toEqual(['"bun:test"']);
  });

  test("returns no findings for clean Node.js source", () => {
    expect(findBunRuntimeReferences('import { parseArgs } from "node:util";')).toEqual([]);
  });
});

describe("findBrowserUiReferences", () => {
  test("detects react-dom / react imports", () => {
    expect(findBrowserUiReferences('import "react-dom";')).toEqual(["react-dom"]);
    expect(findBrowserUiReferences(`import { useState } from 'react';`)).toEqual(["from 'react'"]);
  });

  test("returns no findings for CLI-only source", () => {
    expect(findBrowserUiReferences('import { parseArgs } from "node:util";')).toEqual([]);
  });
});

describe("sanitizeSourceMapSources", () => {
  test("rewrites bundler-relative sources to clean repo-relative paths", () => {
    const outputDir = "/workspaces/installerer/.git/kura/worktrees/81/dist-npm/bin";
    const repoRoot = "/workspaces/installerer/.git/kura/worktrees/81";
    const rawSources = ["../../src/cli/dispatch.ts", "../../src/cli/node/main.ts"];

    expect(sanitizeSourceMapSources(rawSources, outputDir, repoRoot)).toEqual([
      "src/cli/dispatch.ts",
      "src/cli/node/main.ts",
    ]);
  });

  test("falls back to a basename-only path for sources outside the repo root", () => {
    const outputDir = "/workspaces/installerer/.git/kura/worktrees/81/dist-npm/bin";
    const repoRoot = "/workspaces/installerer/.git/kura/worktrees/81";

    expect(sanitizeSourceMapSources(["/etc/secret.ts"], outputDir, repoRoot)).toEqual([
      "external/secret.ts",
    ]);
  });
});

describe("assertNoLeakedSourcePaths", () => {
  test("does not throw for clean repo-relative paths", () => {
    expect(() => assertNoLeakedSourcePaths(["src/cli/dispatch.ts"])).not.toThrow();
  });

  test("throws for an absolute path", () => {
    expect(() => assertNoLeakedSourcePaths(["/etc/secret.ts"])).toThrow();
  });

  test("throws for a path containing a parent-directory segment", () => {
    expect(() => assertNoLeakedSourcePaths(["../secret.ts"])).toThrow();
  });
});

describe("findMachineSpecificPathLeaks", () => {
  const repoRoot = "/workspaces/installerer/.git/kura/worktrees/81";

  test("detects the repo's own absolute checkout path", () => {
    // repoRoot itself starts with a known home-directory prefix, so both
    // the exact-repoRoot match and the prefix match are reported.
    expect(findMachineSpecificPathLeaks(`"sourceRoot":"${repoRoot}"`, repoRoot)).toEqual([
      repoRoot,
      "/workspaces/",
    ]);
  });

  test("detects a repo root outside any known home-directory prefix", () => {
    const ciRoot = "/build/installerer";
    expect(findMachineSpecificPathLeaks(`"sourceRoot":"${ciRoot}"`, ciRoot)).toEqual([ciRoot]);
  });

  test("detects a home-directory prefix even outside the repo root", () => {
    expect(findMachineSpecificPathLeaks('"names":["/home/alice/notes.txt"]', repoRoot)).toEqual([
      "/home/",
    ]);
  });

  test("returns no findings for repo-relative text", () => {
    expect(findMachineSpecificPathLeaks('"sources":["src/cli/dispatch.ts"]', repoRoot)).toEqual([]);
  });
});

describe("findSecretLeaks", () => {
  test("detects an embedded private key header", () => {
    expect(findSecretLeaks("-----BEGIN RSA PRIVATE KEY-----")).toEqual([
      "-----BEGIN RSA PRIVATE KEY-----",
    ]);
  });

  test("detects a GitHub token shape", () => {
    expect(findSecretLeaks(`token: "ghp_${"a".repeat(36)}"`)).toEqual([`ghp_${"a".repeat(36)}`]);
  });

  test("returns no findings for ordinary source text", () => {
    expect(findSecretLeaks('import { parseArgs } from "node:util";')).toEqual([]);
  });
});

describe("buildPublishPackageJson", () => {
  test("carries the root name/version without private/dependencies/scripts", () => {
    const pkg = buildPublishPackageJson({ name: "@philomagi/installerer", version: "1.2.3" });

    expect(pkg.name).toBe("@philomagi/installerer");
    expect(pkg.version).toBe("1.2.3");
    expect(pkg.private).toBeUndefined();
    expect(pkg.dependencies).toBeUndefined();
    expect(pkg.scripts).toBeUndefined();
    expect(pkg.bin).toEqual({ installerer: "./bin/installerer.js" });
    expect(pkg.files).toEqual(["bin"]);
    expect(pkg.engines).toEqual(NPM_CLI_ENGINES);
  });
});
