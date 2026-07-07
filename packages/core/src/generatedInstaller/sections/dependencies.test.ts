import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

import { validateInstallerConfig } from "../../installerConfig";
import { createRenderContext, type RenderContext } from "../renderContext";
import { renderDependencies } from "./dependencies";
import { renderFail } from "./diagnostics";

const configInput = {
  owner: "tooppoo",
  repo: "rellog",
  binary: { name: "rellog", pathInArchive: "bin/rellog" },
  archive: { format: "tar.gz", nameTemplate: "{repo}_{version}_{target}.tar.gz" },
  checksum: { fileName: "checksums.txt", algorithm: "sha256" },
  targets: [{ os: "linux", arch: "x86_64" }],
};

function contextWithExtraDependency(commands: string[]): RenderContext {
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
        ...base.resolvedDependencies.dependencies,
        {
          id: "test-extra-all-commands",
          label: "test extra all-commands dependency",
          reason: "test",
          check: { type: "all-commands", commands },
        },
      ],
    },
  };
}

function runCheckRuntimeDependencies(context: RenderContext) {
  const script = `ARCHIVE_FORMAT=${context.config.archive.format}\n${renderFail()}${renderDependencies(context)}\ncheck_runtime_dependencies\nprintf 'gate passed\\n'\n`;
  // No `env` override: inherits the calling process's PATH so every real
  // base/archive/checksum command resolves normally, isolating the
  // assertions below to the synthetic extra dependency's own commands.
  return spawnSync("sh", ["-s"], { input: script, encoding: "utf8" });
}

describe("renderDependencies with a dependency check type other than command/any-command-by-checksum-id", () => {
  test("an all-commands dependency added later is required by the pre-install gate, not silently skipped", () => {
    const context = contextWithExtraDependency(["sh", "this-command-does-not-exist-zzz"]);

    const result = runCheckRuntimeDependencies(context);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("test extra all-commands dependency is required");
    expect(result.stdout).not.toContain("gate passed");
  });

  test("passes through when every command in the all-commands dependency is present", () => {
    const context = contextWithExtraDependency(["sh"]);

    const result = runCheckRuntimeDependencies(context);

    expect(result.stdout).toContain("gate passed");
  });
});
