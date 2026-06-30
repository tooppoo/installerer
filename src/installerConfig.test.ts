import { describe, expect, test } from "bun:test";

import { parseInstallerConfig, validateInstallerConfig } from "./installerConfig";

const validConfig = {
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
  },
  checksum: {
    fileName: "checksums.txt",
    algorithm: "sha256",
  },
  targets: [
    { os: "linux", arch: "x86_64" },
    { os: "darwin", arch: "aarch64" },
  ],
};

describe("installer config validation", () => {
  test("parses valid JSON and adds defaults", () => {
    const result = parseInstallerConfig(JSON.stringify(validConfig));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.defaults).toEqual({
        version: "latest",
        installDir: "$HOME/.local/bin",
      });
    }
  });

  test("rejects invalid JSON", () => {
    const result = parseInstallerConfig("{");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.path).toBe("$");
    }
  });

  test("rejects missing required fields and unknown object fields", () => {
    const result = validateInstallerConfig({
      ...validConfig,
      extra: true,
      checksum: {
        algorithm: "sha256",
        unknown: "x",
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual(
        expect.objectContaining({ path: "$.extra", reason: "Unknown field is not supported." }),
      );
      expect(result.errors).toContainEqual(
        expect.objectContaining({ path: "$.checksum.fileName", reason: "Required field is missing." }),
      );
      expect(result.errors).toContainEqual(
        expect.objectContaining({ path: "$.checksum.unknown", reason: "Unknown field is not supported." }),
      );
    }
  });

  test("validates resolver-specific fields", () => {
    const latestAssetWithFile = validateInstallerConfig({
      ...validConfig,
      versionResolver: {
        type: "latest_asset",
        fileName: "VERSION",
      },
    });
    const releaseVersionWithoutFile = validateInstallerConfig({
      ...validConfig,
      versionResolver: {
        type: "release_version_file",
      },
    });
    const unsupportedResolver = validateInstallerConfig({
      ...validConfig,
      versionResolver: {
        type: "redirect_tag",
      },
    });

    expect(latestAssetWithFile.ok).toBe(false);
    expect(releaseVersionWithoutFile.ok).toBe(false);
    expect(unsupportedResolver.ok).toBe(false);
  });

  test("rejects unsafe filenames and archive paths", () => {
    const result = validateInstallerConfig({
      ...validConfig,
      binary: {
        name: ".rellog",
        pathInArchive: "bin/../rellog",
      },
      checksum: {
        fileName: "checksums txt",
        algorithm: "sha256",
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map(error => error.path)).toEqual(
        expect.arrayContaining(["$.binary.name", "$.binary.pathInArchive", "$.checksum.fileName"]),
      );
    }
  });

  test("allows git tag names that need URL path encoding", () => {
    const result = validateInstallerConfig({
      ...validConfig,
      defaults: {
        version: "release/2026.06",
        installDir: "~/bin",
      },
    });

    expect(result.ok).toBe(true);
  });

  test("rejects invalid default version and install directories", () => {
    const result = validateInstallerConfig({
      ...validConfig,
      defaults: {
        version: "bad tag",
        installDir: "$HOME/../bin",
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map(error => error.path)).toEqual(
        expect.arrayContaining(["$.defaults.version", "$.defaults.installDir"]),
      );
    }
  });

  test("allows dot-prefixed install dir segments that are not dot segments", () => {
    const homeResult = validateInstallerConfig({
      ...validConfig,
      defaults: {
        version: "v1.0.0",
        installDir: "$HOME/.local/bin",
      },
    });
    const absoluteResult = validateInstallerConfig({
      ...validConfig,
      defaults: {
        version: "v1.0.0",
        installDir: "/usr/local/bin",
      },
    });

    expect(homeResult.ok).toBe(true);
    expect(absoluteResult.ok).toBe(true);
  });

  test("rejects unsupported targets and duplicate entries", () => {
    const result = validateInstallerConfig({
      ...validConfig,
      targets: [
        { os: "linux", arch: "x86_64" },
        { os: "linux", arch: "x86_64" },
        { os: "windows", arch: "amd64" },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map(error => error.path)).toEqual(
        expect.arrayContaining(["$.targets[1]", "$.targets[2].os", "$.targets[2].arch"]),
      );
    }
  });
});
