import type { InstallerConfig, TargetArch, TargetOS, ValidationError } from "./installerConfig";

export type ArchiveFormat = "tar.gz" | "zip";
export type ArchivePlaceholder = "owner" | "repo" | "bin" | "version" | "os" | "arch" | "target";

export type ArchiveTemplateSegment =
  | {
      type: "literal";
      value: string;
    }
  | {
      type: "placeholder";
      name: ArchivePlaceholder;
    };

export type ArchiveTemplateWarning = {
  path: string;
  reason: string;
  recommended: string;
};

export type ArchiveNamePreview = {
  os: TargetOS;
  arch: TargetArch;
  latestName: string;
  pinnedName: string;
  warnings: ArchiveTemplateWarning[];
};

export type ModeGraph = {
  mode: "main" | "install_latest" | "install_pin";
  edges: Array<[string, string]>;
  directContexts: Record<string, string[]>;
};

const ALLOWED_PLACEHOLDERS = new Set<ArchivePlaceholder>([
  "owner",
  "repo",
  "bin",
  "version",
  "os",
  "arch",
  "target",
]);
const ARCHIVE_FILENAME_HARD_CHARS = /[\/\\\s\x00-\x1f\x7f]/;
const ARCHIVE_FILENAME_WARNING_CHARS = /['"`$;&|<>()\[\]*?~#]/;

export function parseArchiveNameTemplate(
  template: string,
  path = "$.archive.nameTemplate",
): { ok: true; segments: ArchiveTemplateSegment[] } | { ok: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const segments: ArchiveTemplateSegment[] = [];
  let literalStart = 0;
  let index = 0;

  while (index < template.length) {
    const char = template[index];

    if (char === "}") {
      errors.push({
        path,
        reason: "Malformed archive filename template: unmatched closing brace.",
        expected: "literal text or {owner}, {repo}, {bin}, {version}, {os}, {arch}, {target}",
      });
      return { ok: false, errors };
    }

    if (char !== "{") {
      index += 1;
      continue;
    }

    if (literalStart < index) {
      segments.push({ type: "literal", value: template.slice(literalStart, index) });
    }

    const closeIndex = template.indexOf("}", index + 1);
    if (closeIndex === -1) {
      errors.push({
        path,
        reason: "Malformed archive filename template: unmatched opening brace.",
        expected: "close placeholders with }",
      });
      return { ok: false, errors };
    }

    const name = template.slice(index + 1, closeIndex);
    if (name.length === 0) {
      errors.push({
        path,
        reason: "Malformed archive filename template: empty placeholder.",
        expected: "one of {owner}, {repo}, {bin}, {version}, {os}, {arch}, {target}",
      });
      return { ok: false, errors };
    }

    if (name.includes("{") || name.includes("}")) {
      errors.push({
        path,
        reason: "Malformed archive filename template: nested braces are not supported.",
        expected: "single-pass placeholders such as {repo}",
      });
      return { ok: false, errors };
    }

    if (!ALLOWED_PLACEHOLDERS.has(name as ArchivePlaceholder)) {
      errors.push({
        path,
        reason: `Unknown archive filename placeholder: {${name}}.`,
        expected: "{owner} | {repo} | {bin} | {version} | {os} | {arch} | {target}",
      });
      return { ok: false, errors };
    }

    segments.push({ type: "placeholder", name: name as ArchivePlaceholder });
    index = closeIndex + 1;
    literalStart = index;
  }

  if (literalStart < template.length) {
    segments.push({ type: "literal", value: template.slice(literalStart) });
  }

  return { ok: true, segments };
}

export function templateUsesPlaceholder(segments: ArchiveTemplateSegment[], name: ArchivePlaceholder) {
  return segments.some(segment => segment.type === "placeholder" && segment.name === name);
}

export function expandArchiveNameTemplate(
  segments: ArchiveTemplateSegment[],
  values: {
    owner: string;
    repo: string;
    bin: string;
    version: string;
    os: TargetOS;
    arch: TargetArch;
  },
) {
  return segments
    .map(segment => {
      if (segment.type === "literal") {
        return segment.value;
      }

      if (segment.name === "bin") {
        return values.bin;
      }

      if (segment.name === "target") {
        return `${values.os}_${values.arch}`;
      }

      return values[segment.name];
    })
    .join("");
}

export function validateArchiveFilename(
  value: string,
  format: ArchiveFormat,
  path = "$.archive.nameTemplate",
): { errors: ValidationError[]; warnings: ArchiveTemplateWarning[] } {
  const errors: ValidationError[] = [];
  const warnings: ArchiveTemplateWarning[] = [];
  const expectedSuffix = archiveFormatSuffix(format);

  if (value.length === 0) {
    errors.push({
      path,
      reason: "Archive filename must not be empty.",
      expected: `filename ending with ${expectedSuffix}`,
    });
  }

  if (ARCHIVE_FILENAME_HARD_CHARS.test(value)) {
    errors.push({
      path,
      reason: "Archive filename must not contain path separators, whitespace, or control characters.",
      expected: "a single GitHub Release asset filename",
    });
  }

  if (!value.endsWith(expectedSuffix)) {
    errors.push({
      path,
      reason: "Archive filename suffix does not match archive.format.",
      expected: expectedSuffix,
    });
  }

  warnings.push(...archiveFilenameWarnings(value, path));
  return { errors, warnings };
}

export function validateArchiveTemplateForConfig(
  config: InstallerConfig,
  segments: ArchiveTemplateSegment[],
): { errors: ValidationError[]; warnings: ArchiveTemplateWarning[]; previews: ArchiveNamePreview[] } {
  const errors: ValidationError[] = [];
  const warnings: ArchiveTemplateWarning[] = [];
  const previews: ArchiveNamePreview[] = [];

  if (config.versionResolver.type === "latest_asset" && templateUsesPlaceholder(segments, "version")) {
    errors.push({
      path: "$.archive.nameTemplate",
      reason: "latest_asset archives must use versionless archive filename templates.",
      expected: "omit {version} or use release_version_file",
    });
  }

  for (const segment of segments) {
    if (segment.type === "literal") {
      if (ARCHIVE_FILENAME_HARD_CHARS.test(segment.value)) {
        errors.push({
          path: "$.archive.nameTemplate",
          reason: "Archive filename template literal contains a character that is invalid in archive filenames.",
          expected: "no slash, backslash, whitespace, or control characters",
        });
      }
    }
  }

  for (const target of config.targets) {
    const baseValues = {
      owner: config.owner,
      repo: config.repo,
      bin: config.binary.name,
      os: target.os,
      arch: target.arch,
    };
    const latestName = expandArchiveNameTemplate(segments, { ...baseValues, version: "v1.2.3" });
    const pinnedName = expandArchiveNameTemplate(segments, { ...baseValues, version: "release/v1.2.3" });
    const latestValidation = validateArchiveFilename(latestName, config.archive.format);
    const pinnedValidation = validateArchiveFilename(pinnedName, config.archive.format);

    errors.push(...latestValidation.errors);
    warnings.push(...latestValidation.warnings);

    previews.push({
      ...target,
      latestName,
      pinnedName,
      warnings: [...latestValidation.warnings, ...pinnedValidation.warnings],
    });
  }

  return { errors: dedupeErrors(errors), warnings: dedupeWarnings(warnings), previews };
}

export function buildMainGraph(): ModeGraph {
  return {
    mode: "main",
    edges: [["dispatch", "version_arg"]],
    directContexts: {
      version_arg: ["shell command argument context", "Git tag context"],
      dispatch: ["argument parsing context"],
    },
  };
}

export function buildInstallLatestGraph(config: InstallerConfig, segments: ArchiveTemplateSegment[]): ModeGraph {
  const edges: Array<[string, string]> = [
    ["target", "os"],
    ["target", "arch"],
    ["archive_url", "owner"],
    ["archive_url", "repo"],
    ["archive_url", "archive_asset_name"],
    ["checksum_url", "owner"],
    ["checksum_url", "repo"],
    ["checksum_url", "checksum.fileName"],
    ["checksum_lookup_key", "archive_asset_name"],
    ["archive_path", "tmpdir"],
    ["archive_path", "fixed local archive filename"],
  ];

  if (config.versionResolver.type === "release_version_file") {
    edges.push(
      ["resolved_version", "versionResolver.fileName"],
      ["archive_url", "resolved_version"],
      ["checksum_url", "resolved_version"],
      ["version_file_url", "owner"],
      ["version_file_url", "repo"],
      ["version_file_url", "versionResolver.fileName"],
    );
  }

  addArchiveTemplateEdges(edges, segments, config.versionResolver.type === "release_version_file" ? "resolved_version" : undefined);

  return { mode: "install_latest", edges, directContexts: installDirectContexts(config) };
}

export function buildInstallPinGraph(config: InstallerConfig, segments: ArchiveTemplateSegment[]): ModeGraph {
  const edges: Array<[string, string]> = [
    ["target", "os"],
    ["target", "arch"],
    ["archive_url", "owner"],
    ["archive_url", "repo"],
    ["archive_url", "pinned_version"],
    ["archive_url", "archive_asset_name"],
    ["checksum_url", "owner"],
    ["checksum_url", "repo"],
    ["checksum_url", "pinned_version"],
    ["checksum_url", "checksum.fileName"],
    ["checksum_lookup_key", "archive_asset_name"],
    ["archive_path", "tmpdir"],
    ["archive_path", "fixed local archive filename"],
  ];

  addArchiveTemplateEdges(edges, segments, templateUsesPlaceholder(segments, "version") ? "pinned_version" : undefined);

  return { mode: "install_pin", edges, directContexts: installDirectContexts(config) };
}

export function archiveFormatSuffix(format: ArchiveFormat) {
  return format === "tar.gz" ? ".tar.gz" : ".zip";
}

function addArchiveTemplateEdges(
  edges: Array<[string, string]>,
  segments: ArchiveTemplateSegment[],
  versionSymbol: "resolved_version" | "pinned_version" | undefined,
) {
  edges.push(["archive_asset_name", "archive.nameTemplate literal segments"]);

  for (const placeholder of ["owner", "repo", "bin", "os", "arch", "target"] as const) {
    if (templateUsesPlaceholder(segments, placeholder)) {
      edges.push(["archive_asset_name", placeholder]);
    }
  }

  if (versionSymbol && templateUsesPlaceholder(segments, "version")) {
    edges.push(["archive_asset_name", versionSymbol]);
  }
}

function installDirectContexts(config: InstallerConfig): Record<string, string[]> {
  return {
    archive_asset_name: ["archive filename context", "checksum lookup context", "shell literal context"],
    archive_url: ["Release URL context", "shell command argument context"],
    checksum_url: ["Release URL context", "shell command argument context"],
    checksum_lookup_key: ["checksum lookup context"],
    "checksum.fileName": ["safe filename context", "Release URL path segment context", "shell literal context"],
    archive_path: ["local filesystem context", "shell command argument context"],
    resolved_version: ["Git tag context", "Release URL path segment context"],
    pinned_version: ["Git tag context", "Release URL path segment context"],
    ...(config.versionResolver.type === "release_version_file"
      ? { "versionResolver.fileName": ["safe filename context", "Release URL path segment context", "shell literal context"] }
      : {}),
  };
}

function archiveFilenameWarnings(value: string, path: string): ArchiveTemplateWarning[] {
  const warnings: ArchiveTemplateWarning[] = [];

  if (value.startsWith("-")) {
    warnings.push({
      path,
      reason: "Archive filename starts with '-'. The generated installer uses fixed local paths, but external tools may interpret this as an option.",
      recommended: "Prefix the filename with the repository or binary name.",
    });
  }

  if (value.startsWith(".")) {
    warnings.push({
      path,
      reason: "Archive filename starts with '.'. Hidden-style asset names are easy to miss in local tooling.",
      recommended: "Prefix the filename with the repository or binary name.",
    });
  }

  if (value.endsWith(".")) {
    warnings.push({
      path,
      reason: "Archive filename ends with '.'. Some tools and filesystems handle trailing dots inconsistently.",
      recommended: "End the filename with the archive suffix only.",
    });
  }

  if (!/^[\x00-\x7f]*$/.test(value)) {
    warnings.push({
      path,
      reason: "Archive filename contains non-ASCII characters. The installer percent-encodes URL path segments, but older tools can display these inconsistently.",
      recommended: "Use ASCII letters, digits, '.', '_', and '-'.",
    });
  }

  if (ARCHIVE_FILENAME_WARNING_CHARS.test(value)) {
    warnings.push({
      path,
      reason: "Archive filename contains shell-metacharacter-looking characters. The installer quotes values, but the name is harder to audit.",
      recommended: "Use ASCII letters, digits, '.', '_', and '-'.",
    });
  }

  return warnings;
}

function dedupeErrors(errors: ValidationError[]) {
  const seen = new Set<string>();
  return errors.filter(error => {
    const key = `${error.path}\0${error.reason}\0${error.expected ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeWarnings(warnings: ArchiveTemplateWarning[]) {
  const seen = new Set<string>();
  return warnings.filter(warning => {
    const key = `${warning.path}\0${warning.reason}\0${warning.recommended}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
