import { describe, expect, test } from "bun:test";

import type { InstallerConfig } from "../installerConfig";
import { resolveRuntimeDependencies } from "./resolve";
import { renderRuntimeRequirementsJson } from "./renderJson";
import { matchTextSnapshot } from "../../test/helpers/snapshot";

const baseConfig: InstallerConfig = {
  owner: "tooppoo",
  repo: "rellog",
  binary: {
    name: "rellog",
    pathInArchive: "bin/rellog",
  },
  archive: {
    format: "tar.gz",
    nameTemplate: "{repo}_{version}_{os}_{arch}.tar.gz",
    osCase: "lowercase",
  },
  checksum: {
    fileName: "checksums.txt",
    algorithm: "sha256",
  },
  targets: [{ os: "linux", arch: "x86_64" }],
  architectureLabels: {
    linux: { x86_64: "x86_64", aarch64: "aarch64" },
    darwin: { x86_64: "x86_64", aarch64: "aarch64" },
  },
  defaults: {
    installDir: "$HOME/.local/bin",
  },
};

describe("renderRuntimeRequirementsJson", () => {
  test("returns a plain { dependencies, premises } object", () => {
    const json = renderRuntimeRequirementsJson(resolveRuntimeDependencies(baseConfig));
    expect(Object.keys(json).sort()).toEqual(["dependencies", "premises"]);
  });

  test("shape is pinned by a committed snapshot (internal use only, not an external contract)", () => {
    const json = renderRuntimeRequirementsJson(resolveRuntimeDependencies(baseConfig));
    matchTextSnapshot(
      "runtime-requirements.with-version-tar-gz",
      "json",
      `${JSON.stringify(json, null, 2)}\n`,
    );
  });

  test("shape reflects a zip archive's dependency", () => {
    const json = renderRuntimeRequirementsJson(
      resolveRuntimeDependencies({
        ...baseConfig,
        archive: { ...baseConfig.archive, format: "zip" },
      }),
    );
    matchTextSnapshot(
      "runtime-requirements.with-version-zip",
      "json",
      `${JSON.stringify(json, null, 2)}\n`,
    );
  });
});
