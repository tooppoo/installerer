import { describe, expect, test } from "bun:test";

import {
  isValidGitTagName,
  parseInstallerConfig,
  validateInstallerConfig,
} from "./installerConfig";

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
  // Explicit so unrelated tests below don't depend on architectureLabels
  // defaults tested separately in the "architecture label mapping" describe.
  architectureLabels: { x86_64: "x86_64", aarch64: "aarch64" },
};

describe("installer config validation", () => {
  test("parses valid JSON, adds defaults, and returns archive previews plus dependency graphs", () => {
    const result = parseInstallerConfig(JSON.stringify(validConfig));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.defaults).toEqual({
        installDir: "$HOME/.local/bin",
      });
      expect(result.archivePreviews.map((preview) => preview.latestName)).toEqual([
        "rellog_v1.2.3_linux_x86_64.tar.gz",
        "rellog_v1.2.3_darwin_aarch64.tar.gz",
      ]);
      expect(result.warnings).toEqual([]);
      expect(result.dependencyGraphs.map((graph) => graph.mode)).toEqual([
        "main",
        "install_latest",
        "install_pin",
      ]);
      expect(result.dependencyGraphs[1]?.edges).toContainEqual({
        derived: "archive_path",
        source: "fixed local archive filename",
      });
      expect(result.dependencyGraphs[1]?.edges).not.toContainEqual({
        derived: "archive_path",
        source: "archive_asset_name",
      });
      expect(
        result.contextPropagations.find((graph) => graph.mode === "install_pin")
          ?.reachableContextsByVariable.pinned_version,
      ).toContain("archive filename context");
      expect(
        result.contextPropagations.find((graph) => graph.mode === "install_pin")
          ?.reachableContextsByVariable.pinned_version,
      ).toContain("Release URL path segment context");
    }
  });

  test("defaults archive.osCase to lowercase when omitted", () => {
    const result = validateInstallerConfig(validConfig);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.archive.osCase).toBe("lowercase");
    }
  });

  test("renders capitalized OS names in archive previews when archive.osCase is capitalized", () => {
    const result = validateInstallerConfig({
      ...validConfig,
      archive: {
        ...validConfig.archive,
        osCase: "capitalized",
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.archivePreviews.map((preview) => preview.latestName)).toEqual([
        "rellog_v1.2.3_Linux_x86_64.tar.gz",
        "rellog_v1.2.3_Darwin_aarch64.tar.gz",
      ]);
    }
  });

  test("rejects an unsupported archive.osCase value", () => {
    const result = validateInstallerConfig({
      ...validConfig,
      archive: {
        ...validConfig.archive,
        osCase: "upper",
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: "$.archive.osCase",
          reason: "Unsupported archive OS name case.",
        }),
      );
    }
  });

  test("rejects invalid JSON", () => {
    const result = parseInstallerConfig("{");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.path).toBe("$");
      expect(result.warnings).toEqual([]);
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
        expect.objectContaining({
          path: "$.checksum.fileName",
          reason: "Required field is missing.",
        }),
      );
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: "$.checksum.unknown",
          reason: "Unknown field is not supported.",
        }),
      );
    }
  });

  test("rejects non-object roots and non-string scalar fields", () => {
    const rootResult = validateInstallerConfig(null);
    const scalarResult = validateInstallerConfig({
      ...validConfig,
      owner: 1,
      binary: "rellog",
      targets: "linux-x86_64",
      defaults: "$HOME/.local/bin",
    });

    expect(rootResult.ok).toBe(false);
    if (!rootResult.ok) {
      expect(rootResult.errors).toContainEqual(
        expect.objectContaining({ path: "$", reason: "Value must be an object." }),
      );
    }

    expect(scalarResult.ok).toBe(false);
    if (!scalarResult.ok) {
      expect(scalarResult.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "$.owner", reason: "Value must be a string." }),
          expect.objectContaining({ path: "$.binary", reason: "Value must be an object." }),
          expect.objectContaining({ path: "$.targets", reason: "Value must be an array." }),
          expect.objectContaining({ path: "$.defaults", reason: "Value must be an object." }),
        ]),
      );
    }
  });

  test("rejects unsafe owner, repo, checksum algorithm, and empty targets", () => {
    const result = validateInstallerConfig({
      ...validConfig,
      owner: "-tooppoo",
      repo: "rellog/rellog",
      checksum: {
        fileName: "checksums.txt",
        algorithm: "sha512",
      },
      targets: [],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "$.owner" }),
          expect.objectContaining({ path: "$.repo" }),
          expect.objectContaining({ path: "$.checksum.algorithm" }),
          expect.objectContaining({ path: "$.targets" }),
        ]),
      );
    }
  });

  test("validates resolver-specific fields and latest_asset versionless templates", () => {
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
    const latestAssetWithVersionTemplate = validateInstallerConfig({
      ...validConfig,
      versionResolver: {
        type: "latest_asset",
      },
      archive: {
        format: "tar.gz",
        nameTemplate: "{repo}_{version}_{target}.tar.gz",
      },
    });

    expect(latestAssetWithFile.ok).toBe(false);
    expect(releaseVersionWithoutFile.ok).toBe(false);
    expect(unsupportedResolver.ok).toBe(false);
    expect(latestAssetWithVersionTemplate.ok).toBe(false);
  });

  test("rejects unsafe config filenames and archive paths", () => {
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
      expect(result.errors.map((error) => error.path)).toEqual(
        expect.arrayContaining(["$.binary.name", "$.binary.pathInArchive", "$.checksum.fileName"]),
      );
    }
  });

  test("rejects malformed and unknown archive template placeholders", () => {
    for (const nameTemplate of ["{repo", "repo}", "{}", "{{repo}}", "{asset}"]) {
      const result = validateInstallerConfig({
        ...validConfig,
        archive: {
          format: "tar.gz",
          nameTemplate,
        },
      });

      expect(result.ok).toBe(false);
    }
  });

  test("allows release_version_file template to contain version", () => {
    const result = validateInstallerConfig({
      ...validConfig,
      archive: {
        format: "tar.gz",
        nameTemplate: "{repo}_{version}_{target}.tar.gz",
      },
    });

    expect(result.ok).toBe(true);
  });

  test("does not propagate archive filename context to pinned_version for versionless latest_asset templates", () => {
    const result = validateInstallerConfig({
      ...validConfig,
      versionResolver: {
        type: "latest_asset",
      },
      archive: {
        format: "tar.gz",
        nameTemplate: "{repo}_{target}.tar.gz",
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const pinContexts = result.contextPropagations.find(
        (graph) => graph.mode === "install_pin",
      )?.reachableContextsByVariable;

      expect(pinContexts?.pinned_version).toContain("Git tag context");
      expect(pinContexts?.pinned_version).toContain("Release URL path segment context");
      expect(pinContexts?.pinned_version).not.toContain("archive filename context");
    }
  });

  test("uses propagated archive filename context to reject hard characters in template literals", () => {
    const result = validateInstallerConfig({
      ...validConfig,
      archive: {
        format: "tar.gz",
        nameTemplate: "{repo}/{target}.tar.gz",
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: "$.archive.nameTemplate",
          reason:
            "Archive filename template literal contains a character that is invalid in archive filenames.",
        }),
      );
    }
  });

  test("rejects defaults.version because runtime --version dispatch owns version selection", () => {
    const result = validateInstallerConfig({
      ...validConfig,
      defaults: {
        version: "latest",
        installDir: "$HOME/.local/bin",
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: "$.defaults.version",
          reason: "Unknown field is not supported.",
        }),
      );
    }
  });

  test("validates install directories", () => {
    const homeResult = validateInstallerConfig({
      ...validConfig,
      defaults: {
        installDir: "$HOME/.local/bin",
      },
    });
    const absoluteResult = validateInstallerConfig({
      ...validConfig,
      defaults: {
        installDir: "/usr/local/bin",
      },
    });
    const badResult = validateInstallerConfig({
      ...validConfig,
      defaults: {
        installDir: "$HOME/../bin",
      },
    });

    expect(homeResult.ok).toBe(true);
    expect(absoluteResult.ok).toBe(true);
    expect(badResult.ok).toBe(false);
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
      expect(result.errors.map((error) => error.path)).toEqual(
        expect.arrayContaining(["$.targets[1]", "$.targets[2].os", "$.targets[2].arch"]),
      );
    }
  });

  test("supports zip archives and rejects suffix mismatch", () => {
    const zip = validateInstallerConfig({
      ...validConfig,
      archive: {
        format: "zip",
        nameTemplate: "{bin}_{target}.zip",
      },
      versionResolver: {
        type: "latest_asset",
      },
    });
    const mismatch = validateInstallerConfig({
      ...validConfig,
      archive: {
        format: "zip",
        nameTemplate: "{bin}_{target}.tar.gz",
      },
      versionResolver: {
        type: "latest_asset",
      },
    });

    expect(zip.ok).toBe(true);
    expect(mismatch.ok).toBe(false);
  });

  test("returns user-facing archive filename warnings", () => {
    const result = validateInstallerConfig({
      ...validConfig,
      archive: {
        format: "tar.gz",
        nameTemplate: "-{repo}_{target}.tar.gz",
      },
      versionResolver: {
        type: "latest_asset",
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings[0]?.reason).toContain("starts with '-'");
      expect(result.warnings[0]?.recommended).toContain("Prefix");
    }
  });

  test("returns warnings for hidden, trailing-dot, non-ASCII, and metacharacter archive names", () => {
    const result = validateInstallerConfig({
      ...validConfig,
      archive: {
        format: "zip",
        nameTemplate: ".rellog_é_$.zip",
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings.map((warning) => warning.reason)).toEqual(
        expect.arrayContaining([
          expect.stringContaining("starts with '.'"),
          expect.stringContaining("non-ASCII"),
          expect.stringContaining("shell-metacharacter-looking"),
        ]),
      );
    }

    const trailingDot = validateInstallerConfig({
      ...validConfig,
      archive: {
        format: "zip",
        nameTemplate: "{repo}.zip.",
      },
    });

    expect(trailingDot.ok).toBe(false);
    if (!trailingDot.ok) {
      expect(trailingDot.warnings.map((warning) => warning.reason)).toContain(
        "Archive filename ends with '.'. Some tools and filesystems handle trailing dots inconsistently.",
      );
    }
  });
});

describe("architecture label mapping", () => {
  test("defaults architectureLabels to the OS-reported architecture name when omitted", () => {
    const { architectureLabels: _architectureLabels, ...withoutLabels } = validConfig;
    const result = validateInstallerConfig(withoutLabels);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.architectureLabels).toEqual({ x86_64: "x86_64", aarch64: "aarch64" });
      expect(result.archivePreviews.map((preview) => preview.latestName)).toEqual([
        "rellog_v1.2.3_linux_x86_64.tar.gz",
        "rellog_v1.2.3_darwin_aarch64.tar.gz",
      ]);
    }
  });

  test("accepts custom asset labels not in the presets", () => {
    const result = validateInstallerConfig({
      ...validConfig,
      architectureLabels: { x86_64: "x64", aarch64: "arm64-v8a" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.archivePreviews.map((preview) => preview.latestName)).toEqual([
        "rellog_v1.2.3_linux_x64.tar.gz",
        "rellog_v1.2.3_darwin_arm64-v8a.tar.gz",
      ]);
    }
  });

  test("allows the same asset label for both canonical architectures", () => {
    const result = validateInstallerConfig({
      ...validConfig,
      architectureLabels: { x86_64: "universal", aarch64: "universal" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.archivePreviews.map((preview) => preview.latestName)).toEqual([
        "rellog_v1.2.3_linux_universal.tar.gz",
        "rellog_v1.2.3_darwin_universal.tar.gz",
      ]);
    }
  });

  test.each(["", ".", "..", "arm/64", "arm 64", "arm\\64"])(
    "rejects unsafe architecture label %j",
    (label) => {
      const result = validateInstallerConfig({
        ...validConfig,
        architectureLabels: { x86_64: label, aarch64: "arm64" },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContainEqual(
          expect.objectContaining({ path: "$.architectureLabels.x86_64" }),
        );
      }
    },
  );

  test("rejects unknown fields inside architectureLabels", () => {
    const result = validateInstallerConfig({
      ...validConfig,
      architectureLabels: { x86_64: "amd64", aarch64: "arm64", riscv64: "riscv64" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual(
        expect.objectContaining({ path: "$.architectureLabels.riscv64" }),
      );
    }
  });
});

describe("isValidGitTagName", () => {
  test("accepts ordinary Git tag names", () => {
    expect(isValidGitTagName("v1.2.3")).toBe(true);
    expect(isValidGitTagName("release/v1.2.3")).toBe(true);
  });

  test("rejects empty names, path-like names, ref syntax, lock suffixes, and unsafe chars", () => {
    for (const tag of [
      "",
      "/v1.2.3",
      "v1.2.3/",
      "v1.2.3.",
      "@",
      "release//v1.2.3",
      "release..v1.2.3",
      "release@{v1.2.3",
      ".hidden/v1.2.3",
      "release.lock",
      "v1.2.3~",
      "v1.2.3^",
      "v1.2.3:",
      "v1.2.3?",
      "v1.2.3*",
      "v1.2.3[",
      "v1.2.3\\",
      "v1.2.3 ",
      "v1.2.3\u007f",
    ]) {
      expect(isValidGitTagName(tag)).toBe(false);
    }
  });
});
