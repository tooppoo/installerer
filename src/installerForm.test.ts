import { describe, expect, test } from "bun:test";

import { validateInstallerConfig } from "./installerConfig";
import { generateInstaller } from "./installerGenerator";
import {
  buildInstallerConfig,
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
