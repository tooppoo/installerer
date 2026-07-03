import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

import { validateInstallerConfig } from "../../installerConfig";
import { generateInstaller } from "../../installerGenerator";

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

describe("main() install-option / test-option handling", () => {
  test("--check-requirements alone runs only the check, not print_requirements", () => {
    const script = generateScript();

    const result = spawnSync("sh", ["-s", "--", "--check-requirements"], {
      input: script,
      encoding: "utf8",
    });

    expect(result.stdout).not.toContain("Runtime requirements for this installer:");
    expect(result.stdout).toContain("Checking runtime requirements...");
  });

  test("usage lists --requirements and --check-requirements", () => {
    const script = generateScript();

    const result = spawnSync("sh", ["-s", "--", "--bogus-flag"], {
      input: script,
      encoding: "utf8",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("--requirements");
    expect(result.stderr).toContain("--check-requirements");
  });

  test("--help still takes priority and never reaches requirements handling", () => {
    const script = generateScript();

    const result = spawnSync("sh", ["-s", "--", "--help"], {
      input: script,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("Runtime requirements for this installer:");
    expect(result.stdout).toContain("usage:");
  });
});
