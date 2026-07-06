import { describe, expect, test } from "bun:test";

import type { InstallerConfig } from "../installerConfig";
import { generateInstaller } from "./index";
import { createRenderContext } from "./renderContext";

const baseConfig: InstallerConfig = {
  owner: "tooppoo",
  repo: "rellog",
  binary: {
    name: "rellog",
    pathInArchive: "bin/rellog",
  },
  versionResolver: {
    type: "release_version_file",
    fileName: "VERSION",
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
  targets: [
    { os: "linux", arch: "x86_64" },
    { os: "darwin", arch: "aarch64" },
  ],
  architectureLabels: {
    linux: { x86_64: "x86_64", aarch64: "aarch64" },
    darwin: { x86_64: "x86_64", aarch64: "aarch64" },
  },
  defaults: {
    installDir: "$HOME/.local/bin",
  },
};

describe("RenderContext generatorVersion injection boundary", () => {
  test("is undefined when no generatorVersion is passed", () => {
    const context = createRenderContext(baseConfig);

    expect(context.generatorVersion).toBeUndefined();
  });

  test("threads an explicitly passed generatorVersion through, unchanged", () => {
    const context = createRenderContext(baseConfig, "1.2.3");

    expect(context.generatorVersion).toBe("1.2.3");
  });
});

describe("generateInstaller determinism across generatorVersion", () => {
  test("produces byte-identical output regardless of the generatorVersion argument", () => {
    const withoutVersion = generateInstaller(baseConfig);
    const withVersion = generateInstaller(baseConfig, "1.2.3");
    const withOtherVersion = generateInstaller(baseConfig, "9.9.9");

    expect(withVersion).toBe(withoutVersion);
    expect(withOtherVersion).toBe(withoutVersion);
  });
});
