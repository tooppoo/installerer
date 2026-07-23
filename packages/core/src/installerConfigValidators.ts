import {
  CANONICAL_ARCHITECTURES,
  DEFAULT_ARCHITECTURE_LABELS,
  validateAssetArchLabel,
} from "./architectureLabels";
import type {
  ArchitectureLabels,
  ArchitectureLabelsByOs,
  InstallerConfig,
  TargetArch,
  TargetOS,
} from "./installerConfig";
import { isAscii, rejectUnknownFields, requireObject, requireString } from "./validation";
import type { JsonObject, ValidationError } from "./validation";

export const DEFAULT_INSTALL_DIR = "$HOME/.local/bin";
export const SAFE_FILENAME_PATTERN = /^[A-Za-z0-9._-]+$/;
export const GITHUB_OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
export const GITHUB_REPO_PATTERN = /^[A-Za-z0-9._-]+$/;
const SHELL_SENSITIVE_PATH_CHARS = /[ \t\r\n'"`$;&|<>()[\]{}*!?~#]/;
export const TARGET_OPERATING_SYSTEMS: readonly TargetOS[] = ["linux", "darwin"];
export const TARGET_OS = new Set<TargetOS>(TARGET_OPERATING_SYSTEMS);
export const TARGET_ARCH = new Set<TargetArch>(["x86_64", "aarch64"]);

export function validateDefaults(
  value: unknown,
  errors: ValidationError[],
): InstallerConfig["defaults"] | undefined {
  if (value === undefined) {
    return { installDir: DEFAULT_INSTALL_DIR };
  }

  const defaults = requireObject(value, "$.defaults", errors);
  if (!defaults) {
    return undefined;
  }

  rejectUnknownFields(defaults, "$.defaults", ["installDir"], errors);

  const installDir =
    defaults.installDir === undefined
      ? DEFAULT_INSTALL_DIR
      : requireString(defaults.installDir, "$.defaults.installDir", errors);
  if (installDir !== undefined) {
    validateInstallDir(installDir, "$.defaults.installDir", errors);
  }

  if (installDir === undefined) {
    return undefined;
  }

  return { installDir };
}

export function validateTargets(
  value: unknown,
  path: string,
  errors: ValidationError[],
): InstallerConfig["targets"] | undefined {
  if (!Array.isArray(value)) {
    errors.push({
      path,
      reason: value === undefined ? "Required field is missing." : "Value must be an array.",
      expected: "non-empty target array",
    });
    return undefined;
  }

  if (value.length === 0) {
    errors.push({
      path,
      reason: "At least one target is required.",
      expected: "one or more target objects",
    });
    return undefined;
  }

  const targets: InstallerConfig["targets"] = [];
  const seen = new Set<string>();

  value.forEach((entry, index) => {
    const targetPath = `${path}[${index}]`;
    const target = requireObject(entry, targetPath, errors);
    if (!target) {
      return;
    }

    rejectUnknownFields(target, targetPath, ["os", "arch"], errors);
    const os = requireString(target.os, `${targetPath}.os`, errors);
    const arch = requireString(target.arch, `${targetPath}.arch`, errors);

    if (os !== undefined && !TARGET_OS.has(os as TargetOS)) {
      errors.push({
        path: `${targetPath}.os`,
        reason: "Unsupported target OS.",
        expected: "linux | darwin",
      });
    }

    if (arch !== undefined && !TARGET_ARCH.has(arch as TargetArch)) {
      errors.push({
        path: `${targetPath}.arch`,
        reason: "Unsupported target architecture.",
        expected: "x86_64 | aarch64",
      });
    }

    if (TARGET_OS.has(os as TargetOS) && TARGET_ARCH.has(arch as TargetArch)) {
      const key = `${os}/${arch}`;
      if (seen.has(key)) {
        errors.push({
          path: targetPath,
          reason: "Duplicate target entry.",
          expected: "unique os and arch pair",
        });
      } else {
        seen.add(key);
        targets.push({ os: os as TargetOS, arch: arch as TargetArch });
      }
    }
  });

  return targets.length > 0 ? targets : undefined;
}

/**
 * `architectureLabels` accepts two forms:
 *
 * - flat: `{ x86_64?, aarch64? }` — one mapping applied to every target OS
 * - per-OS: `{ linux?: { x86_64?, aarch64? }, darwin?: {...} }` — a mapping
 *   per target OS
 *
 * The two key sets are disjoint, so the form is detected from the keys; mixing
 * OS keys and architecture keys in one object is rejected. Both forms (and any
 * omitted key) normalize to a full `ArchitectureLabelsByOs`.
 */
export function validateArchitectureLabels(
  value: unknown,
  path: string,
  errors: ValidationError[],
): ArchitectureLabelsByOs | undefined {
  if (value === undefined) {
    return architectureLabelsForAllOs({ ...DEFAULT_ARCHITECTURE_LABELS });
  }

  const labels = requireObject(value, path, errors);
  if (!labels) {
    return undefined;
  }

  const isPerOsForm = TARGET_OPERATING_SYSTEMS.some((os) => os in labels);
  if (!isPerOsForm) {
    const flat = validateArchitectureLabelMap(labels, path, errors);
    return flat === undefined ? undefined : architectureLabelsForAllOs(flat);
  }

  rejectUnknownFields(labels, path, [...TARGET_OPERATING_SYSTEMS], errors);

  const resolved: Partial<ArchitectureLabelsByOs> = {};
  let ok = true;

  for (const os of TARGET_OPERATING_SYSTEMS) {
    const fieldPath = `${path}.${os}`;
    const rawValue = labels[os];

    if (rawValue === undefined) {
      resolved[os] = { ...DEFAULT_ARCHITECTURE_LABELS };
      continue;
    }

    const osLabels = requireObject(rawValue, fieldPath, errors);
    if (!osLabels) {
      ok = false;
      continue;
    }

    const validated = validateArchitectureLabelMap(osLabels, fieldPath, errors);
    if (validated === undefined) {
      ok = false;
      continue;
    }

    resolved[os] = validated;
  }

  return ok ? (resolved as ArchitectureLabelsByOs) : undefined;
}

function architectureLabelsForAllOs(labels: ArchitectureLabels): ArchitectureLabelsByOs {
  return Object.fromEntries(
    TARGET_OPERATING_SYSTEMS.map((os) => [os, { ...labels }]),
  ) as ArchitectureLabelsByOs;
}

function validateArchitectureLabelMap(
  labels: JsonObject,
  path: string,
  errors: ValidationError[],
): ArchitectureLabels | undefined {
  rejectUnknownFields(labels, path, [...CANONICAL_ARCHITECTURES], errors);

  const resolved: Partial<ArchitectureLabels> = {};
  let ok = true;

  for (const arch of CANONICAL_ARCHITECTURES) {
    const fieldPath = `${path}.${arch}`;
    const rawValue = labels[arch];
    const label =
      rawValue === undefined
        ? DEFAULT_ARCHITECTURE_LABELS[arch]
        : requireString(rawValue, fieldPath, errors);

    if (label === undefined) {
      ok = false;
      continue;
    }

    const errorCountBeforeLabel = errors.length;
    validateAssetArchLabel(label, fieldPath, errors);
    if (errors.length > errorCountBeforeLabel) {
      ok = false;
      continue;
    }

    resolved[arch] = label;
  }

  return ok ? (resolved as ArchitectureLabels) : undefined;
}

export function validateSafeFilename(value: string, path: string, errors: ValidationError[]) {
  if (
    value.length === 0 ||
    value.startsWith(".") ||
    value.endsWith(".") ||
    !SAFE_FILENAME_PATTERN.test(value)
  ) {
    errors.push({
      path,
      reason: "Value is not a safe filename.",
      expected: "non-empty A-Z a-z 0-9 . _ - with no leading or trailing dot",
    });
  }
}

export function validateArchiveRelativePath(
  value: string,
  path: string,
  errors: ValidationError[],
) {
  const segments = value.split("/");

  if (
    value.length === 0 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    !isAscii(value) ||
    SHELL_SENSITIVE_PATH_CHARS.test(value) ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    errors.push({
      path,
      reason: "Archive path must be a safe relative path without dot segments.",
      expected: "relative ASCII path segments using A-Z a-z 0-9 . _ -",
    });
  }

  // Only the whole value's leading hyphen is rejected, not a per-segment one:
  // the extracted path reaches `tar`/`unzip` as a single argument, so `-x`
  // would be misparsed as an option, while `bin/-binary` stays an operand.
  if (value.startsWith("-")) {
    errors.push({
      path,
      reason:
        "Archive path must not start with a hyphen; an extraction tool could read it as an option.",
      expected: "a path whose first character is not '-'",
    });
  }
}

function validateInstallDir(value: string, path: string, errors: ValidationError[]) {
  const hasAllowedPrefix =
    value === "$HOME" ||
    value.startsWith("$HOME/") ||
    value === "~" ||
    value.startsWith("~/") ||
    value.startsWith("/");

  const relativePart =
    value === "$HOME" || value === "~"
      ? ""
      : value.startsWith("$HOME/")
        ? value.slice("$HOME/".length)
        : value.startsWith("~/")
          ? value.slice("~/".length)
          : value.startsWith("/")
            ? value.slice(1)
            : value;
  const segments = relativePart === "" ? [] : relativePart.split("/");

  if (
    value.length === 0 ||
    !hasAllowedPrefix ||
    value.startsWith("$HOMEfoo") ||
    value.startsWith("~user") ||
    value.includes("\\") ||
    (value !== "/" && relativePart === "") ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    errors.push({
      path,
      reason: "Install directory must be absolute or start with $HOME or ~, without dot segments.",
      expected: "$HOME, $HOME/..., ~, ~/..., or /...",
    });
  }
}
