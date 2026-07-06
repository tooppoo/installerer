import { describe, expect, test } from "bun:test";

import type { InstallerConfig } from "../../installerConfig";
import { createRenderContext } from "../renderContext";
import { composeInstallerScript } from "../script";
import { renderMetadataComment } from "./metadataComment";

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
    { os: "linux", arch: "aarch64" },
    { os: "darwin", arch: "x86_64" },
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

describe("renderMetadataComment", () => {
  test("emits the effective config as a whitelisted shell comment", () => {
    const comment = renderMetadataComment(createRenderContext(baseConfig));

    expect(comment).toContain("# Effective installer configuration:");
    expect(comment).toContain("#   generator.name: installerer");
    expect(comment).toContain("#   generator.sourceUrl: https://github.com/tooppoo/installerer");
    expect(comment).toContain("#   owner: tooppoo");
    expect(comment).toContain("#   repo: rellog");
    expect(comment).toContain("#   binary.name: rellog");
    expect(comment).toContain("#   binary.pathInArchive: bin/rellog");
    expect(comment).toContain("#   versionResolver.type: release_version_file");
    expect(comment).toContain("#   versionResolver.fileName: VERSION");
    expect(comment).toContain("#   archive.format: tar.gz");
    expect(comment).toContain("#   archive.nameTemplate: {repo}_{version}_{os}_{arch}.tar.gz");
    expect(comment).toContain("#   archive.osCase: lowercase");
    expect(comment).toContain("#   checksum.fileName: checksums.txt");
    expect(comment).toContain("#   checksum.algorithm: sha256");
    expect(comment).toContain("#   defaults.installDir: $HOME/.local/bin");
    expect(comment).toContain(
      "#   targets: linux/x86_64, linux/aarch64, darwin/x86_64, darwin/aarch64",
    );
  });

  test("omits versionResolver.fileName for latest_asset", () => {
    const config: InstallerConfig = {
      ...baseConfig,
      versionResolver: { type: "latest_asset" },
      archive: { ...baseConfig.archive, nameTemplate: "{repo}_{os}_{arch}.tar.gz" },
    };

    const comment = renderMetadataComment(createRenderContext(config));

    expect(comment).toContain("#   versionResolver.type: latest_asset");
    expect(comment).not.toContain("versionResolver.fileName");
  });

  test("does not include a timestamp", () => {
    const comment = renderMetadataComment(createRenderContext(baseConfig));

    expect(comment).not.toMatch(/generatedAt/i);
    expect(comment).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test("does not dump the raw config object", () => {
    const comment = renderMetadataComment(createRenderContext(baseConfig));

    expect(comment).not.toContain(JSON.stringify(baseConfig));
    expect(comment).not.toMatch(/"owner"\s*:/);
    expect(comment).not.toMatch(/"binary"\s*:/);
  });

  test("escapes control characters instead of letting them break the comment block", () => {
    const hostile: InstallerConfig = {
      ...baseConfig,
      binary: {
        ...baseConfig.binary,
        name: 'safe\nrm -rf "$HOME"',
      },
    };

    const comment = renderMetadataComment(createRenderContext(hostile));

    // Every non-blank line of the comment block must still start with "#":
    // a raw newline in a config value must not produce an executable line.
    const lines = comment.split("\n").filter((line) => line.length > 0);
    for (const line of lines) {
      expect(line.startsWith("#")).toBe(true);
    }
    expect(comment).toContain('binary.name: safe\\nrm -rf "$HOME"');
  });

  test("is emitted after the header and before the runtime constants", () => {
    const script = composeInstallerScript(createRenderContext(baseConfig));

    const headerEnd = script.indexOf("fi\n\n") + "fi\n\n".length;
    const metadataStart = script.indexOf("# Effective installer configuration:");
    const constantsStart = script.indexOf("OWNER=");

    expect(metadataStart).toBeGreaterThan(headerEnd - 1);
    expect(constantsStart).toBeGreaterThan(metadataStart);
  });
});
