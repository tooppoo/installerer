import { describe, expect, test } from "bun:test";

import { validateInstallerConfig } from "./installerConfig";
import { generateInstaller } from "./installerGenerator";
import {
  architectureLabelSelection,
  ARCHITECTURE_LABEL_PRESETS,
  buildInstallerConfig,
  CUSTOM_ARCHITECTURE_LABEL,
  initialFormState,
  isTargetSelected,
  TARGET_OPTIONS,
  toggleTarget,
  versionResolverExample,
  type InstallerFormState,
} from "./installerForm";

describe("buildInstallerConfig", () => {
  test("builds a config that the core validator accepts", () => {
    const config = buildInstallerConfig(initialFormState);
    const result = validateInstallerConfig(config);
    expect(result.ok).toBe(true);
  });

  test("the built config produces a generated installer through the core", () => {
    const result = validateInstallerConfig(buildInstallerConfig(initialFormState));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const installer = generateInstaller(result.config);
    expect(installer.startsWith("#!/bin/sh")).toBe(true);
  });

  test("release_version_file includes fileName", () => {
    const config = buildInstallerConfig({
      ...initialFormState,
      versionResolverType: "release_version_file",
      versionResolverFileName: "VERSION",
    });
    expect(config.versionResolver).toEqual({ type: "release_version_file", fileName: "VERSION" });
  });

  test("latest_asset omits fileName", () => {
    const config = buildInstallerConfig({
      ...initialFormState,
      versionResolverType: "latest_asset",
      versionResolverFileName: "VERSION",
      // latest_asset requires a versionless archive template (core is the source of truth).
      archiveNameTemplate: "{repo}_{os}_{arch}.tar.gz",
    });
    expect(config.versionResolver).toEqual({ type: "latest_asset" });
    expect(validateInstallerConfig(config).ok).toBe(true);
  });

  test("zip format is selectable and validates against the core", () => {
    const config = buildInstallerConfig({
      ...initialFormState,
      archiveFormat: "zip",
      archiveNameTemplate: "{repo}_{version}_{os}_{arch}.zip",
    }) as { archive: { format: string } };
    expect(config.archive.format).toBe("zip");
    expect(validateInstallerConfig(config).ok).toBe(true);
  });

  test("archive.osCase defaults to lowercase and is included in the built config", () => {
    const config = buildInstallerConfig(initialFormState) as {
      archive: { osCase: string };
    };
    expect(config.archive.osCase).toBe("lowercase");
  });

  test("archive.osCase capitalized is selectable and validates against the core", () => {
    const config = buildInstallerConfig({ ...initialFormState, archiveOsCase: "capitalized" });
    const result = validateInstallerConfig(config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.archive.osCase).toBe("capitalized");
    }
  });

  test("checksum.algorithm is always sha256", () => {
    const config = buildInstallerConfig(initialFormState) as {
      checksum: { algorithm: string };
    };
    expect(config.checksum.algorithm).toBe("sha256");
  });

  test("does not include defaults.version", () => {
    const config = buildInstallerConfig(initialFormState) as { defaults: Record<string, unknown> };
    expect("version" in config.defaults).toBe(false);
  });

  test("invalid form input yields validation errors from the core", () => {
    const form: InstallerFormState = { ...initialFormState, owner: "" };
    const result = validateInstallerConfig(buildInstallerConfig(form));
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors.some((error) => error.path === "$.owner")).toBe(true);
  });
});

describe("versionResolverExample", () => {
  test("release_version_file shows the VERSION lookup then the resolved-tag download", () => {
    const steps = versionResolverExample({
      ...initialFormState,
      owner: "tooppoo",
      repo: "rellog",
      versionResolverType: "release_version_file",
      versionResolverFileName: "VERSION",
    });
    expect(steps).toHaveLength(2);
    expect(steps[0]?.url).toBe(
      "https://github.com/tooppoo/rellog/releases/latest/download/VERSION",
    );
    expect(steps[1]?.url).toContain("https://github.com/tooppoo/rellog/releases/download/v1.2.3/");
  });

  test("latest_asset shows a single direct latest download", () => {
    const steps = versionResolverExample({
      ...initialFormState,
      owner: "tooppoo",
      repo: "rellog",
      versionResolverType: "latest_asset",
      archiveNameTemplate: "{repo}_{os}_{arch}.tar.gz",
    });
    expect(steps).toHaveLength(1);
    expect(steps[0]?.url).toBe(
      "https://github.com/tooppoo/rellog/releases/latest/download/rellog_linux_x86_64.tar.gz",
    );
  });

  test("respects archiveOsCase when rendering the example archive name", () => {
    const steps = versionResolverExample({
      ...initialFormState,
      owner: "tooppoo",
      repo: "rellog",
      versionResolverType: "latest_asset",
      archiveNameTemplate: "{repo}_{os}_{arch}.tar.gz",
      archiveOsCase: "capitalized",
    });
    expect(steps[0]?.url).toBe(
      "https://github.com/tooppoo/rellog/releases/latest/download/rellog_Linux_x86_64.tar.gz",
    );
  });

  test("falls back to placeholders for empty owner/repo", () => {
    const steps = versionResolverExample({ ...initialFormState, owner: "", repo: "" });
    expect(steps[0]?.url).toContain("https://github.com/OWNER/REPO/releases");
  });
});

describe("target selection", () => {
  test("toggle removes a selected target", () => {
    const target = { os: "linux", arch: "x86_64" } as const;
    expect(isTargetSelected(initialFormState, target)).toBe(true);
    const next = toggleTarget(initialFormState, target);
    expect(isTargetSelected(next, target)).toBe(false);
  });

  test("toggle re-adds in canonical order", () => {
    const emptyTargets: InstallerFormState = { ...initialFormState, targets: [] };
    const withDarwin = toggleTarget(emptyTargets, { os: "darwin", arch: "aarch64" });
    const withLinux = toggleTarget(withDarwin, { os: "linux", arch: "x86_64" });
    expect(withLinux.targets).toEqual([
      { os: "linux", arch: "x86_64" },
      { os: "darwin", arch: "aarch64" },
    ]);
  });

  test("TARGET_OPTIONS covers the supported OS/arch matrix", () => {
    expect(TARGET_OPTIONS).toHaveLength(4);
  });
});

describe("architecture label selection", () => {
  test("initialFormState uses the default OS-reported architecture name mapping", () => {
    expect(initialFormState.architectureLabels).toEqual({ x86_64: "x86_64", aarch64: "aarch64" });
  });

  test("built config includes architectureLabels and validates through the core", () => {
    const config = buildInstallerConfig(initialFormState) as {
      architectureLabels: Record<string, string>;
    };
    expect(config.architectureLabels).toEqual({ x86_64: "x86_64", aarch64: "aarch64" });
    expect(validateInstallerConfig(config).ok).toBe(true);
  });

  test("recognizes preset values for each canonical architecture", () => {
    expect(architectureLabelSelection("x86_64", "amd64")).toBe("amd64");
    expect(architectureLabelSelection("x86_64", "x86_64")).toBe("x86_64");
    expect(architectureLabelSelection("aarch64", "arm64")).toBe("arm64");
    expect(architectureLabelSelection("aarch64", "aarch64")).toBe("aarch64");
  });

  test("treats any non-preset value as custom", () => {
    expect(architectureLabelSelection("x86_64", "x64")).toBe(CUSTOM_ARCHITECTURE_LABEL);
    expect(architectureLabelSelection("aarch64", "arm64-v8a")).toBe(CUSTOM_ARCHITECTURE_LABEL);
  });

  test("ARCHITECTURE_LABEL_PRESETS lists the representative spellings from the issue", () => {
    expect(ARCHITECTURE_LABEL_PRESETS.x86_64).toEqual(["amd64", "x86_64"]);
    expect(ARCHITECTURE_LABEL_PRESETS.aarch64).toEqual(["arm64", "aarch64"]);
  });

  test("custom architecture labels flow into the generated archive name", () => {
    const form: InstallerFormState = {
      ...initialFormState,
      versionResolverType: "latest_asset",
      archiveNameTemplate: "{repo}_{os}_{arch}.tar.gz",
      targets: [{ os: "linux", arch: "x86_64" }],
      architectureLabels: { x86_64: "x64", aarch64: "arm64-v8a" },
    };
    const result = validateInstallerConfig(buildInstallerConfig(form));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.archivePreviews[0]?.latestName).toBe("rellog_linux_x64.tar.gz");
    }
  });
});
