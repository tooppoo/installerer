import {
  parseArchiveNameTemplate,
  type ArchiveNamePreview,
  type ArchiveTemplateWarning,
} from "./archiveTemplate";
import {
  validateArchiveTemplateForConfig,
  type ContextPropagation,
  type ModeGraph,
} from "./archiveTemplateValidation";
import {
  GITHUB_OWNER_PATTERN,
  GITHUB_REPO_PATTERN,
  validateArchitectureLabels,
  validateArchiveRelativePath,
  validateDefaults,
  validateSafeFilename,
  validateTargets,
} from "./installerConfigValidators";
import { rejectUnknownFields, requireObject, requireString } from "./validation";
import type { ValidationError } from "./validation";

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
export type OsCase = "lowercase" | "capitalized";

/**
 * Resolved `canonical_arch -> asset_arch_label` mapping for one target OS.
 * `asset_arch_label` is the value embedded in Release asset names via the
 * `{arch}`/`{target}` archive.nameTemplate placeholders; it is independent of
 * `TargetArch`, the runtime-detected canonical architecture (see
 * docs/generated-installer-runtime.md).
 */
export type ArchitectureLabels = Record<TargetArch, string>;

/**
 * Resolved `(target_os, canonical_arch) -> asset_arch_label` mapping. The
 * config accepts either a flat `ArchitectureLabels` object (applied to every
 * OS) or one `ArchitectureLabels` object per OS; both normalize to this shape.
 */
export type ArchitectureLabelsByOs = Record<TargetOS, ArchitectureLabels>;

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
    osCase: OsCase;
  };
  checksum: {
    fileName: string;
    algorithm: "sha256";
  };
  targets: Array<{
    os: TargetOS;
    arch: TargetArch;
  }>;
  architectureLabels: ArchitectureLabelsByOs;
  defaults: {
    installDir: string;
  };
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

export { type ValidationError };

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

  rejectUnknownFields(
    root,
    "$",
    [
      "owner",
      "repo",
      "binary",
      "versionResolver",
      "archive",
      "checksum",
      "targets",
      "architectureLabels",
      "defaults",
    ],
    errors,
  );

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
      const fileName = requireString(
        versionResolver.fileName,
        "$.versionResolver.fileName",
        errors,
      );
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
    rejectUnknownFields(archive, "$.archive", ["format", "nameTemplate", "osCase"], errors);
  }
  const archiveFormat = archive
    ? requireString(archive.format, "$.archive.format", errors)
    : undefined;
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
  const archiveOsCaseInput = archive
    ? archive.osCase === undefined
      ? "lowercase"
      : requireString(archive.osCase, "$.archive.osCase", errors)
    : undefined;
  if (
    archiveOsCaseInput !== undefined &&
    archiveOsCaseInput !== "lowercase" &&
    archiveOsCaseInput !== "capitalized"
  ) {
    errors.push({
      path: "$.archive.osCase",
      reason: "Unsupported archive OS name case.",
      expected: "lowercase | capitalized",
    });
  }
  const archiveOsCase =
    archiveOsCaseInput === "lowercase" || archiveOsCaseInput === "capitalized"
      ? archiveOsCaseInput
      : undefined;

  const checksum = requireObject(root.checksum, "$.checksum", errors);
  if (checksum) {
    rejectUnknownFields(checksum, "$.checksum", ["fileName", "algorithm"], errors);
  }
  const checksumFileName = checksum
    ? requireString(checksum.fileName, "$.checksum.fileName", errors)
    : undefined;
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
  const architectureLabels = validateArchitectureLabels(
    root.architectureLabels,
    "$.architectureLabels",
    errors,
  );
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
    archiveOsCase === undefined ||
    checksumFileName === undefined ||
    checksumAlgorithm !== "sha256" ||
    targets === undefined ||
    architectureLabels === undefined ||
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
      osCase: archiveOsCase,
    },
    checksum: {
      fileName: checksumFileName,
      algorithm: "sha256",
    },
    targets,
    architectureLabels,
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
    hasUnsafeGitTagChar(value)
  ) {
    return false;
  }

  return value
    .split("/")
    .every(
      (segment) => segment.length > 0 && !segment.startsWith(".") && !segment.endsWith(".lock"),
    );
}

function hasUnsafeGitTagChar(value: string) {
  const unsafeChars = new Set(["~", "^", ":", "?", "*", "[", "\\"]);

  for (const char of value) {
    const code = char.charCodeAt(0);

    if (code <= 32 || code === 127 || unsafeChars.has(char)) {
      return true;
    }
  }

  return false;
}
