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

export type GraphVariableName = string;
export type GraphContextName = string;
export type DirectContextsByVariable = Record<GraphVariableName, GraphContextName[]>;
export type ReachableContextsByVariable = Record<GraphVariableName, GraphContextName[]>;

export type GraphEdge = {
  derived: GraphVariableName;
  source: GraphVariableName;
};

export type ModeGraph = {
  mode: "main" | "install_latest" | "install_pin";
  edges: GraphEdge[];
  directContexts: DirectContextsByVariable;
};

export type ContextPropagation = {
  mode: ModeGraph["mode"];
  reachableContextsByVariable: ReachableContextsByVariable;
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
): {
  errors: ValidationError[];
  warnings: ArchiveTemplateWarning[];
  previews: ArchiveNamePreview[];
  dependencyGraphs: ModeGraph[];
  contextPropagations: ContextPropagation[];
} {
  const errors: ValidationError[] = [];
  const warnings: ArchiveTemplateWarning[] = [];
  const previews: ArchiveNamePreview[] = [];
  const dependencyGraphs = [
    buildMainGraph(),
    buildInstallLatestGraph(config, segments),
    buildInstallPinGraph(config, segments),
  ];
  const contextPropagations = dependencyGraphs.map(graph => ({
    mode: graph.mode,
    reachableContextsByVariable: propagateGraphContexts(graph),
  }));

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

  for (const propagation of contextPropagations) {
    errors.push(...validateConcreteSourcesForContexts(config, propagation.reachableContextsByVariable));
    errors.push(...validateGraphInvariants(propagation));
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

  return {
    errors: dedupeErrors(errors),
    warnings: dedupeWarnings(warnings),
    previews,
    dependencyGraphs,
    contextPropagations,
  };
}

export function propagateGraphContexts(graph: ModeGraph): ReachableContextsByVariable {
  const contextSetByVariable = new Map<GraphVariableName, Set<GraphContextName>>();

  for (const [variable, directContexts] of Object.entries(graph.directContexts)) {
    contextSetByVariable.set(variable, new Set(directContexts));
  }

  for (const { derived, source } of graph.edges) {
    if (!contextSetByVariable.has(derived)) {
      contextSetByVariable.set(derived, new Set());
    }
    if (!contextSetByVariable.has(source)) {
      contextSetByVariable.set(source, new Set());
    }
  }

  let changed = true;
  while (changed) {
    changed = false;

    for (const { derived, source } of graph.edges) {
      const derivedContexts = contextSetByVariable.get(derived);
      const sourceContexts = contextSetByVariable.get(source);

      if (!derivedContexts || !sourceContexts) {
        continue;
      }

      for (const context of derivedContexts) {
        if (!sourceContexts.has(context)) {
          sourceContexts.add(context);
          changed = true;
        }
      }
    }
  }

  return Object.fromEntries(
    [...contextSetByVariable.entries()].map(([variable, contextSet]) => [variable, [...contextSet].sort()]),
  );
}

export function buildMainGraph(): ModeGraph {
  return {
    mode: "main",
    edges: [{ derived: "dispatch", source: "version_arg" }],
    directContexts: {
      version_arg: ["shell command argument context", "Git tag context"],
      dispatch: ["argument parsing context"],
    },
  };
}

export function buildInstallLatestGraph(config: InstallerConfig, segments: ArchiveTemplateSegment[]): ModeGraph {
  const edges: GraphEdge[] = [
    { derived: "target", source: "os" },
    { derived: "target", source: "arch" },
    { derived: "archive_url", source: "owner" },
    { derived: "archive_url", source: "repo" },
    { derived: "archive_url", source: "archive_asset_name" },
    { derived: "checksum_url", source: "owner" },
    { derived: "checksum_url", source: "repo" },
    { derived: "checksum_url", source: "checksum.fileName" },
    { derived: "checksum_lookup_key", source: "archive_asset_name" },
    { derived: "archive_path", source: "tmpdir" },
    { derived: "archive_path", source: "fixed local archive filename" },
  ];

  if (config.versionResolver.type === "release_version_file") {
    edges.push(
      { derived: "resolved_version", source: "versionResolver.fileName" },
      { derived: "archive_url", source: "resolved_version" },
      { derived: "checksum_url", source: "resolved_version" },
      { derived: "version_file_url", source: "owner" },
      { derived: "version_file_url", source: "repo" },
      { derived: "version_file_url", source: "versionResolver.fileName" },
    );
  }

  addArchiveTemplateEdges(edges, segments, config.versionResolver.type === "release_version_file" ? "resolved_version" : undefined);

  return { mode: "install_latest", edges, directContexts: installDirectContexts(config) };
}

export function buildInstallPinGraph(config: InstallerConfig, segments: ArchiveTemplateSegment[]): ModeGraph {
  const edges: GraphEdge[] = [
    { derived: "target", source: "os" },
    { derived: "target", source: "arch" },
    { derived: "archive_url", source: "owner" },
    { derived: "archive_url", source: "repo" },
    { derived: "archive_url", source: "pinned_version" },
    { derived: "archive_url", source: "archive_asset_name" },
    { derived: "checksum_url", source: "owner" },
    { derived: "checksum_url", source: "repo" },
    { derived: "checksum_url", source: "pinned_version" },
    { derived: "checksum_url", source: "checksum.fileName" },
    { derived: "checksum_lookup_key", source: "archive_asset_name" },
    { derived: "archive_path", source: "tmpdir" },
    { derived: "archive_path", source: "fixed local archive filename" },
  ];

  addArchiveTemplateEdges(edges, segments, templateUsesPlaceholder(segments, "version") ? "pinned_version" : undefined);

  return { mode: "install_pin", edges, directContexts: installDirectContexts(config) };
}

export function archiveFormatSuffix(format: ArchiveFormat) {
  return format === "tar.gz" ? ".tar.gz" : ".zip";
}

function addArchiveTemplateEdges(
  edges: GraphEdge[],
  segments: ArchiveTemplateSegment[],
  versionSymbol: "resolved_version" | "pinned_version" | undefined,
) {
  edges.push({ derived: "archive_asset_name", source: "archive.nameTemplate literal segments" });

  for (const placeholder of ["owner", "repo", "bin", "os", "arch", "target"] as const) {
    if (templateUsesPlaceholder(segments, placeholder)) {
      edges.push({ derived: "archive_asset_name", source: placeholder });
    }
  }

  if (versionSymbol && templateUsesPlaceholder(segments, "version")) {
    edges.push({ derived: "archive_asset_name", source: versionSymbol });
  }
}

function installDirectContexts(config: InstallerConfig): DirectContextsByVariable {
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

function validateConcreteSourcesForContexts(
  config: InstallerConfig,
  reachableContextsByVariable: ReachableContextsByVariable,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const sourceValues: Record<string, { path: string; value: string }> = {
    owner: { path: "$.owner", value: config.owner },
    repo: { path: "$.repo", value: config.repo },
    bin: { path: "$.binary.name", value: config.binary.name },
    "checksum.fileName": { path: "$.checksum.fileName", value: config.checksum.fileName },
    "archive.nameTemplate literal segments": {
      path: "$.archive.nameTemplate",
      value: config.archive.nameTemplate,
    },
    ...(config.versionResolver.type === "release_version_file"
      ? {
          "versionResolver.fileName": {
            path: "$.versionResolver.fileName",
            value: config.versionResolver.fileName,
          },
        }
      : {}),
  };

  for (const [source, sourceValue] of Object.entries(sourceValues)) {
    const contexts = reachableContextsByVariable[source] ?? [];

    if (contexts.includes("archive filename context")) {
      if (source === "archive.nameTemplate literal segments") {
        for (const char of sourceValue.value) {
          if (ARCHIVE_FILENAME_HARD_CHARS.test(char) && char !== "{" && char !== "}") {
            errors.push({
              path: sourceValue.path,
              reason: "Archive filename template literal contains a character that is invalid in archive filenames.",
              expected: "no slash, backslash, whitespace, or control characters",
            });
            break;
          }
        }
      } else if (ARCHIVE_FILENAME_HARD_CHARS.test(sourceValue.value)) {
        errors.push({
          path: sourceValue.path,
          reason: "Value flows into archive filename context and contains a forbidden filename character.",
          expected: "no slash, backslash, whitespace, or control characters",
        });
      }
    }

    if (contexts.includes("Release URL path segment context") && /[\x00-\x1f\x7f]/.test(sourceValue.value)) {
      errors.push({
        path: sourceValue.path,
        reason: "Value flows into a GitHub Release URL path segment and contains a control character.",
        expected: "text that can be UTF-8 percent-encoded as one URL path segment",
      });
    }

    if (contexts.includes("shell literal context") && sourceValue.value.includes("\0")) {
      errors.push({
        path: sourceValue.path,
        reason: "Value cannot be safely embedded as a shell literal because it contains NUL.",
        expected: "string without NUL",
      });
    }
  }

  return errors;
}

function validateGraphInvariants(propagation: ContextPropagation): ValidationError[] {
  const archivePathContexts = propagation.reachableContextsByVariable.archive_path ?? [];
  const archiveAssetContexts = propagation.reachableContextsByVariable.archive_asset_name ?? [];

  if (
    archivePathContexts.includes("archive filename context") ||
    archiveAssetContexts.includes("local filesystem context")
  ) {
    return [
      {
        path: "$.archive.nameTemplate",
        reason: "Remote archive asset name must not flow into local temporary archive path.",
        expected: "archive_path depends only on tmpdir and a fixed local archive filename",
      },
    ];
  }

  return [];
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
