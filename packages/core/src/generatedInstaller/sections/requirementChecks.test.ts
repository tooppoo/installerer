import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { validateInstallerConfig } from "../../installerConfig";
import { generateInstaller } from "../../installerGenerator";
import { createRenderContext, type RenderContext } from "../renderContext";
import { renderCheckRequirements } from "./requirementChecks";

const configInput = {
  owner: "tooppoo",
  repo: "rellog",
  binary: { name: "rellog", pathInArchive: "bin/rellog" },
  versionResolver: { type: "release_version_file", fileName: "VERSION" },
  archive: { format: "tar.gz", nameTemplate: "{repo}_{version}_{target}.tar.gz" },
  checksum: { fileName: "checksums.txt", algorithm: "sha256" },
  targets: [{ os: "linux", arch: "x86_64" }],
};

function generateScript() {
  const result = validateInstallerConfig(configInput);
  if (!result.ok) {
    throw new Error("config should be valid");
  }
  return generateInstaller(result.config);
}

const ALL_COMMANDS = [
  "sh",
  "uname",
  "mktemp",
  "rm",
  "mkdir",
  "cp",
  "mv",
  "chmod",
  "curl",
  "awk",
  "grep",
  "od",
  "tr",
  "cut",
  "ls",
  "tar",
  "unzip",
  "sha256sum",
  "shasum",
];

function resolveRealCommand(command: string): string | undefined {
  const result = spawnSync("/bin/sh", ["-c", `command -v ${command}`], { encoding: "utf8" });
  const resolved = result.stdout.trim();
  return resolved.length > 0 ? resolved : undefined;
}

/**
 * Builds a PATH containing only symlinks to the real system commands,
 * omitting every command in `hide`. Because this becomes the *entire* PATH
 * for the spawned shell (no other directories are searched), a hidden
 * command is genuinely unresolvable via `command -v`.
 */
function buildRestrictedPath(hide: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "installerer-restricted-path-"));
  for (const command of ALL_COMMANDS) {
    if (hide.includes(command)) {
      continue;
    }
    const real = resolveRealCommand(command);
    if (real === undefined) {
      continue;
    }
    symlinkSync(real, join(dir, command));
  }
  return dir;
}

describe("check_requirements / --check-requirements", () => {
  test("reports every dependency ok and exits 0 when everything is present", () => {
    const script = generateScript();
    const path = buildRestrictedPath([]);

    const result = spawnSync("sh", ["-s", "--", "--check-requirements"], {
      input: script,
      encoding: "utf8",
      env: { PATH: path },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("ok: tar");
    expect(result.stdout).toContain("ok: curl");
    expect(result.stdout).not.toContain("missing:");
    expect(result.stdout).toContain("All checkable requirements are satisfied.");
    expect(result.stdout).toContain("Not checked:");
    expect(result.stdout).toContain("HTTPS access to GitHub release assets");
    expect(result.stdout).toContain("Write permission to the install directory");
  });

  test("aggregates every missing dependency instead of failing fast, and exits non-zero", () => {
    const script = generateScript();
    const path = buildRestrictedPath(["tar", "awk"]);

    const result = spawnSync("sh", ["-s", "--", "--check-requirements"], {
      input: script,
      encoding: "utf8",
      env: { PATH: path },
    });

    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("missing: tar");
    expect(result.stdout).toContain("missing: awk");
    // Other, unrelated commands are still reported even though two are missing.
    expect(result.stdout).toContain("ok: curl");
    expect(result.stdout).toContain("ok: uname");
    expect(result.stdout).toContain("Some checkable requirements are missing.");
  });

  test("--requirements --check-requirements runs both in order, exit code follows the check", () => {
    const script = generateScript();
    const path = buildRestrictedPath(["tar"]);

    const result = spawnSync("sh", ["-s", "--", "--requirements", "--check-requirements"], {
      input: script,
      encoding: "utf8",
      env: { PATH: path },
    });

    expect(result.status).not.toBe(0);
    const printIndex = result.stdout.indexOf("Runtime requirements for this installer:");
    const checkIndex = result.stdout.indexOf("Checking runtime requirements...");
    expect(printIndex).toBeGreaterThanOrEqual(0);
    expect(checkIndex).toBeGreaterThan(printIndex);
    expect(result.stdout).toContain("missing: tar");
  });
});

describe("check_requirements with an all-commands dependency", () => {
  function contextWithAllCommandsDependency(commands: string[]): RenderContext {
    const result = validateInstallerConfig(configInput);
    if (!result.ok) {
      throw new Error("config should be valid");
    }
    const base = createRenderContext(result.config);
    return {
      ...base,
      resolvedDependencies: {
        ...base.resolvedDependencies,
        dependencies: [
          {
            id: "test-all-commands",
            label: "test all-commands dependency",
            reason: "test",
            check: { type: "all-commands", commands },
          },
        ],
      },
    };
  }

  test("reports ok only when every listed command is present", () => {
    const context = contextWithAllCommandsDependency(["sh", "cat"]);
    const script = `${renderCheckRequirements(context)}\ncheck_requirements\n`;

    const result = spawnSync("sh", ["-s"], { input: script, encoding: "utf8" });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("ok: test all-commands dependency");
  });

  test("reports missing when any listed command is absent", () => {
    const context = contextWithAllCommandsDependency(["sh", "this-command-does-not-exist-zzz"]);
    const script = `${renderCheckRequirements(context)}\ncheck_requirements\n`;

    const result = spawnSync("sh", ["-s"], { input: script, encoding: "utf8" });

    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("missing: test all-commands dependency");
  });
});
