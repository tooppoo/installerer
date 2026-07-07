import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

import { validateInstallerConfig } from "../../installerConfig";
import { generateInstaller } from "../../installerGenerator";
import { resolveRuntimeDependencies } from "../../runtimeDependencies/resolve";
import { renderRuntimeRequirementsText } from "../../runtimeDependencies/renderText";

const configInput = {
  owner: "tooppoo",
  repo: "rellog",
  binary: { name: "rellog", pathInArchive: "bin/rellog" },
  archive: { format: "tar.gz", nameTemplate: "{repo}_{version}_{target}.tar.gz" },
  checksum: { fileName: "checksums.txt", algorithm: "sha256" },
  targets: [{ os: "linux", arch: "x86_64" }],
};

function generateScript() {
  const result = validateInstallerConfig(configInput);
  if (!result.ok) {
    throw new Error("config should be valid");
  }
  return { script: generateInstaller(result.config), config: result.config };
}

describe("print_requirements / --requirements", () => {
  test("--requirements prints the resolved runtime requirements and exits 0 without installing", () => {
    const { script, config } = generateScript();
    const expectedText = renderRuntimeRequirementsText(resolveRuntimeDependencies(config));

    const result = spawnSync("sh", ["-s", "--", "--requirements"], {
      input: script,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(expectedText);
  });

  test("--version and --requirements together fail before any install-flow work runs", () => {
    const { script } = generateScript();

    const result = spawnSync("sh", ["-s", "--", "--version", "v1.0.0", "--requirements"], {
      input: script,
      encoding: "utf8",
    });

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "--requirements/--check-requirements must not be combined with --version/--install-dir",
    );
  });

  test("--install-dir and --check-requirements together are also rejected", () => {
    const { script } = generateScript();

    const result = spawnSync(
      "sh",
      ["-s", "--", "--install-dir", "/tmp/x", "--check-requirements"],
      {
        input: script,
        encoding: "utf8",
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "--requirements/--check-requirements must not be combined with --version/--install-dir",
    );
  });
});
