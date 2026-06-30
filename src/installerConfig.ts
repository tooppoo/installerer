import {
  parseArchiveNameTemplate,
  validateArchiveTemplateForConfig,
  type ArchiveNamePreview,
  type ArchiveTemplateWarning,
  type ContextPropagation,
  type ModeGraph,
} from "./archiveTemplate";

export type VersionResolver =
  | {
      type: "release_version_file";
      fileName: string;
    }
  | {
      type: "latest_asset";
    };

export type TargetOS = "linux" | "darwin";
export type TargetArch = "x86_64" | "aarch64";

export type InstallerConfig = {
  owner: string;
  repo: string;
  binary: {
    name: string;
    pathInArchive: string;
  };
  versionResolver: VersionResolver;
  archive: {
    format: "tar.gz" | "zip";
    nameTemplate: string;
  };
  checksum: {
    fileName: string;
    algorithm: "sha256";
  };
  targets: Array<{
    os: TargetOS;
    arch: TargetArch;
  }>;
  defaults: {
    installDir: string;
  };
};

export type ValidationError = {
  path: string;
  reason: string;
  expected?: string;
};

export type ParseInstallerConfigResult =
  | {
      ok: true;
      config: InstallerConfig;
      archivePreviews: ArchiveNamePreview[];
      warnings: ArchiveTemplateWarning[];
      dependencyGraphs: ModeGraph[];
      contextPropagations: ContextPropagation[];
    }
  | {
      ok: false;
      errors: ValidationError[];
      warnings: ArchiveTemplateWarning[];
    };

type JsonObject = Record<string, unknown>;

const DEFAULT_INSTALL_DIR = "$HOME/.local/bin";
const SAFE_FILENAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const GITHUB_OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const GITHUB_REPO_PATTERN = /^[A-Za-z0-9._-]+$/;
const SHELL_SENSITIVE_PATH_CHARS = /[ \t\r\n'"`$;&|<>()[\]{}*!?~#]/;
const TARGET_OS = new Set<TargetOS>(["linux", "darwin"]);
const TARGET_ARCH = new Set<TargetArch>(["x86_64", "aarch64"]);

export function parseInstallerConfig(json: string): ParseInstallerConfigResult {
  let value: unknown;

  try {
    value = JSON.parse(json);
  } catch (error) {
    return {
      ok: false,
      errors: [
        {
          path: "$",
          reason: error instanceof Error ? error.message : "Invalid JSON.",
          expected: "valid JSON object",
        },
      ],
      warnings: [],
    };
  }

  return validateInstallerConfig(value);
}

export function validateInstallerConfig(value: unknown): ParseInstallerConfigResult {
  const errors: ValidationError[] = [];
  const root = requireObject(value, "$", errors);

  if (!root) {
    return { ok: false, errors, warnings: [] };
  }

  rejectUnknownFields(root, "$", [
    "owner",
    "repo",
    "binary",
    "versionResolver",
    "archive",
    "checksum",
    "targets",
    "defaults",
  ], errors);

  const owner = requireString(root.owner, "$.owner", errors);
  if (owner !== undefined && !GITHUB_OWNER_PATTERN.test(owner)) {
    errors.push({
      path: "$.owner",
      reason: "Owner must be a safe GitHub owner name.",
      expected: "ASCII letters, digits, or hyphen; no leading or trailing hyphen",
    });
  }

  const repo = requireString(root.repo, "$.repo", errors);
  if (repo !== undefined && !GITHUB_REPO_PATTERN.test(repo)) {
    errors.push({
      path: "$.repo",
      reason: "Repository name must be a safe ASCII GitHub repository name.",
      expected: "A-Z a-z 0-9 . _ -",
    });
  }

  const binary = requireObject(root.binary, "$.binary", errors);
  if (binary) {
    rejectUnknownFields(binary, "$.binary", ["name", "pathInArchive"], errors);
  }
  const binaryName = binary ? requireString(binary.name, "$.binary.name", errors) : undefined;
  if (binaryName !== undefined) {
    validateSafeFilename(binaryName, "$.binary.name", errors);
  }
  const binaryPathInArchive = binary
    ? requireString(binary.pathInArchive, "$.binary.pathInArchive", errors)
    : undefined;
  if (binaryPathInArchive !== undefined) {
    validateArchiveRelativePath(binaryPathInArchive, "$.binary.pathInArchive", errors);
  }

  const versionResolver = requireObject(root.versionResolver, "$.versionResolver", errors);
  let normalizedVersionResolver: VersionResolver | undefined;
  if (versionResolver) {
    rejectUnknownFields(versionResolver, "$.versionResolver", ["type", "fileName"], errors);
    const resolverType = requireString(versionResolver.type, "$.versionResolver.type", errors);

    if (resolverType === "release_version_file") {
      const fileName = requireString(versionResolver.fileName, "$.versionResolver.fileName", errors);
      if (fileName !== undefined) {
        validateSafeFilename(fileName, "$.versionResolver.fileName", errors);
        normalizedVersionResolver = { type: "release_version_file", fileName };
      }
    } else if (resolverType === "latest_asset") {
      if ("fileName" in versionResolver) {
        errors.push({
          path: "$.versionResolver.fileName",
          reason: "fileName is not supported for latest_asset.",
          expected: "omit this field",
        });
      } else {
        normalizedVersionResolver = { type: "latest_asset" };
      }
    } else if (resolverType !== undefined) {
      errors.push({
        path: "$.versionResolver.type",
        reason: "Unsupported version resolver.",
        expected: "release_version_file | latest_asset",
      });
    }
  }

  const archive = requireObject(root.archive, "$.archive", errors);
  if (archive) {
    rejectUnknownFields(archive, "$.archive", ["format", "nameTemplate"], errors);
  }
  const archiveFormat = archive ? requireString(archive.format, "$.archive.format", errors) : undefined;
  if (archiveFormat !== undefined && archiveFormat !== "tar.gz" && archiveFormat !== "zip") {
    errors.push({
      path: "$.archive.format",
      reason: "Unsupported archive format.",
      expected: "tar.gz | zip",
    });
  }
  const archiveNameTemplate = archive
    ? requireString(archive.nameTemplate, "$.archive.nameTemplate", errors)
    : undefined;

  const checksum = requireObject(root.checksum, "$.checksum", errors);
  if (checksum) {
    rejectUnknownFields(checksum, "$.checksum", ["fileName", "algorithm"], errors);
  }
  const checksumFileName = checksum ? requireString(checksum.fileName, "$.checksum.fileName", errors) : undefined;
  if (checksumFileName !== undefined) {
    validateSafeFilename(checksumFileName, "$.checksum.fileName", errors);
  }
  const checksumAlgorithm = checksum
    ? requireString(checksum.algorithm, "$.checksum.algorithm", errors)
    : undefined;
  if (checksumAlgorithm !== undefined && checksumAlgorithm !== "sha256") {
    errors.push({
      path: "$.checksum.algorithm",
      reason: "Unsupported checksum algorithm.",
      expected: "sha256",
    });
  }

  const targets = validateTargets(root.targets, "$.targets", errors);
  const defaults = validateDefaults(root.defaults, errors);

  if (
    errors.length > 0 ||
    owner === undefined ||
    repo === undefined ||
    binaryName === undefined ||
    binaryPathInArchive === undefined ||
    normalizedVersionResolver === undefined ||
    (archiveFormat !== "tar.gz" && archiveFormat !== "zip") ||
    archiveNameTemplate === undefined ||
    checksumFileName === undefined ||
    checksumAlgorithm !== "sha256" ||
    targets === undefined ||
    defaults === undefined
  ) {
    return { ok: false, errors, warnings: [] };
  }

  const config: InstallerConfig = {
    owner,
    repo,
    binary: {
      name: binaryName,
      pathInArchive: binaryPathInArchive,
    },
    versionResolver: normalizedVersionResolver,
    archive: {
      format: archiveFormat,
      nameTemplate: archiveNameTemplate,
    },
    checksum: {
      fileName: checksumFileName,
      algorithm: "sha256",
    },
    targets,
    defaults,
  };
  const templateResult = parseArchiveNameTemplate(archiveNameTemplate);
  if (!templateResult.ok) {
    return { ok: false, errors: templateResult.errors, warnings: [] };
  }

  const templateValidation = validateArchiveTemplateForConfig(config, templateResult.segments);
  if (templateValidation.errors.length > 0) {
    return { ok: false, errors: templateValidation.errors, warnings: templateValidation.warnings };
  }

  return {
    ok: true,
    config,
    archivePreviews: templateValidation.previews,
    warnings: templateValidation.warnings,
    dependencyGraphs: templateValidation.dependencyGraphs,
    contextPropagations: templateValidation.contextPropagations,
  };
}

function validateDefaults(value: unknown, errors: ValidationError[]): InstallerConfig["defaults"] | undefined {
  if (value === undefined) {
    return {
      installDir: DEFAULT_INSTALL_DIR,
    };
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

function validateTargets(value: unknown, path: string, errors: ValidationError[]): InstallerConfig["targets"] | undefined {
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

function validateSafeFilename(value: string, path: string, errors: ValidationError[]) {
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

function validateArchiveRelativePath(value: string, path: string, errors: ValidationError[]) {
  const segments = value.split("/");

  if (
    value.length === 0 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    !isAscii(value) ||
    SHELL_SENSITIVE_PATH_CHARS.test(value) ||
    segments.some(segment => segment === "" || segment === "." || segment === "..")
  ) {
    errors.push({
      path,
      reason: "Archive path must be a safe relative path without dot segments.",
      expected: "relative ASCII path segments using A-Z a-z 0-9 . _ -",
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
    segments.some(segment => segment === "" || segment === "." || segment === "..")
  ) {
    errors.push({
      path,
      reason: "Install directory must be absolute or start with $HOME or ~, without dot segments.",
      expected: "$HOME, $HOME/..., ~, ~/..., or /...",
    });
  }
}

export function isValidGitTagName(value: string) {
  if (
    value.length === 0 ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.endsWith(".") ||
    value === "@" ||
    value.includes("//") ||
    value.includes("..") ||
    value.includes("@{") ||
    /[\x00-\x20\x7f~^:?*[\\]/.test(value)
  ) {
    return false;
  }

  return value.split("/").every(segment => segment.length > 0 && !segment.startsWith(".") && !segment.endsWith(".lock"));
}

function requireObject(value: unknown, path: string, errors: ValidationError[]): JsonObject | undefined {
  if (isJsonObject(value)) {
    return value;
  }

  errors.push({
    path,
    reason: value === undefined ? "Required field is missing." : "Value must be an object.",
    expected: "object",
  });
  return undefined;
}

function requireString(value: unknown, path: string, errors: ValidationError[]): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  errors.push({
    path,
    reason: value === undefined ? "Required field is missing." : "Value must be a string.",
    expected: "string",
  });
  return undefined;
}

function rejectUnknownFields(
  object: JsonObject,
  path: string,
  allowedFields: string[],
  errors: ValidationError[],
) {
  const allowed = new Set(allowedFields);

  for (const field of Object.keys(object)) {
    if (!allowed.has(field)) {
      errors.push({
        path: `${path}.${field}`,
        reason: "Unknown field is not supported.",
        expected: `one of: ${allowedFields.join(", ")}`,
      });
    }
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAscii(value: string) {
  return /^[\x20-\x7e]*$/.test(value);
}
