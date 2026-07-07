import { describe, expect, test } from "bun:test";

import { validateInstallerConfig } from "@installerer/core/installerConfig";
import { generateInstaller } from "@installerer/core/installerGenerator";
import {
  architectureLabelSelection,
  ARCHITECTURE_LABEL_PRESETS,
  buildInstallerConfig,
  CUSTOM_ARCHITECTURE_LABEL,
  formArchitectureLabel,
  initialFormState,
  isTargetSelected,
  setArchitectureLabelsPerOs,
  TARGET_OPTIONS,
  toggleTarget,
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

  test("built config never includes versionResolver (removed in issue #111)", () => {
    const config = buildInstallerConfig(initialFormState);
    expect("versionResolver" in config).toBe(false);
  });

  test("a versionless archive template validates against the core", () => {
    const config = buildInstallerConfig({
      ...initialFormState,
      archiveNameTemplate: "{repo}_{os}_{arch}.tar.gz",
    });
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
      archiveNameTemplate: "{repo}_{os}_{arch}.tar.gz",
      targets: [{ os: "linux", arch: "x86_64" }],
      architectureLabels: { x86_64: "x64", aarch64: "arm64-v8a" },
    };
    const result = validateInstallerConfig(buildInstallerConfig(form));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.archivePreviews[0]?.latestName).toBe(
        `${initialFormState.repo}_linux_x64.tar.gz`,
      );
    }
  });
});

describe("per-OS architecture labels", () => {
  test("enabling per-OS mode seeds every OS from the shared labels without changing the config", () => {
    const shared: InstallerFormState = {
      ...initialFormState,
      architectureLabels: { x86_64: "amd64", aarch64: "arm64" },
    };
    const perOs = setArchitectureLabelsPerOs(shared, true);

    expect(perOs.architectureLabelsByOs).toEqual({
      linux: { x86_64: "amd64", aarch64: "arm64" },
      darwin: { x86_64: "amd64", aarch64: "arm64" },
    });

    const sharedResult = validateInstallerConfig(buildInstallerConfig(shared));
    const perOsResult = validateInstallerConfig(buildInstallerConfig(perOs));
    expect(sharedResult.ok).toBe(true);
    expect(perOsResult.ok).toBe(true);
    if (sharedResult.ok && perOsResult.ok) {
      expect(perOsResult.archivePreviews).toEqual(sharedResult.archivePreviews);
    }
  });

  test("built config uses the per-OS form and per-OS labels flow into archive previews", () => {
    const form: InstallerFormState = {
      ...setArchitectureLabelsPerOs(initialFormState, true),
      archiveNameTemplate: "{repo}_{version}_{os}_{arch}.tar.gz",
      archiveOsCase: "capitalized",
      architectureLabelsByOs: {
        linux: { x86_64: "x86_64", aarch64: "aarch64" },
        darwin: { x86_64: "amd64", aarch64: "arm64" },
      },
    };
    const config = buildInstallerConfig(form) as {
      architectureLabels: Record<string, Record<string, string>>;
    };
    expect(config.architectureLabels).toEqual({
      linux: { x86_64: "x86_64", aarch64: "aarch64" },
      darwin: { x86_64: "amd64", aarch64: "arm64" },
    });

    const result = validateInstallerConfig(config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.archivePreviews.map((preview) => preview.latestName)).toEqual([
        `${initialFormState.repo}_v1.2.3_Linux_x86_64.tar.gz`,
        `${initialFormState.repo}_v1.2.3_Linux_aarch64.tar.gz`,
        `${initialFormState.repo}_v1.2.3_Darwin_amd64.tar.gz`,
        `${initialFormState.repo}_v1.2.3_Darwin_arm64.tar.gz`,
      ]);
    }
  });

  test("formArchitectureLabel resolves per-OS labels only in per-OS mode", () => {
    const perOs: InstallerFormState = {
      ...setArchitectureLabelsPerOs(initialFormState, true),
      architectureLabelsByOs: {
        linux: { x86_64: "x86_64", aarch64: "aarch64" },
        darwin: { x86_64: "amd64", aarch64: "arm64" },
      },
    };
    expect(formArchitectureLabel(perOs, "darwin", "x86_64")).toBe("amd64");
    expect(formArchitectureLabel(perOs, "linux", "x86_64")).toBe("x86_64");

    const shared = setArchitectureLabelsPerOs(perOs, false);
    expect(formArchitectureLabel(shared, "darwin", "x86_64")).toBe("x86_64");
  });

  test("disabling per-OS mode falls back to the shared labels in the built config", () => {
    const perOs = setArchitectureLabelsPerOs(initialFormState, true);
    const backToShared = setArchitectureLabelsPerOs(perOs, false);
    const config = buildInstallerConfig(backToShared) as {
      architectureLabels: Record<string, string>;
    };
    expect(config.architectureLabels).toEqual({ x86_64: "x86_64", aarch64: "aarch64" });
    expect(validateInstallerConfig(config).ok).toBe(true);
  });
});
