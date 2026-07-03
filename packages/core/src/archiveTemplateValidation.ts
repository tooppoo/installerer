import type { InstallerConfig } from "./installerConfig";
import type { ValidationError } from "./validation";
import {
  expandArchiveNameTemplate,
  hasArchiveFilenameHardChars,
  templateUsesPlaceholder,
  validateArchiveFilename,
  type ArchiveNamePreview,
  type ArchiveTemplateSegment,
  type ArchiveTemplateWarning,
} from "./archiveTemplate";

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

type GraphValidationInput = {
  config: InstallerConfig;
  segments: ArchiveTemplateSegment[];
  graph: ModeGraph;
  reachableContextsByVariable: ReachableContextsByVariable;
};

type GraphSourceValue = {
  path: string;
  value: string;
};

type GraphSourceValuesByVariable = Record<string, GraphSourceValue>;

type GraphValidationRule = {
  name: string;
  validate(input: GraphValidationInput): ValidationError[];
};

class CompositeGraphValidator {
  constructor(private readonly rules: GraphValidationRule[]) {}

  validate(input: GraphValidationInput): ValidationError[] {
    return this.rules.flatMap((rule) => rule.validate(input));
  }
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
  const contextPropagations = dependencyGraphs.map((graph) => ({
    mode: graph.mode,
    reachableContextsByVariable: propagateGraphContexts(graph),
  }));
  const graphValidator = createArchiveTemplateGraphValidator();

  if (
    config.versionResolver.type === "latest_asset" &&
    templateUsesPlaceholder(segments, "version")
  ) {
    errors.push({
      path: "$.archive.nameTemplate",
      reason: "latest_asset archives must use versionless archive filename templates.",
      expected: "omit {version} or use release_version_file",
    });
  }

  for (const segment of segments) {
    if (segment.type === "literal") {
      if (hasArchiveFilenameHardChars(segment.value)) {
        errors.push({
          path: "$.archive.nameTemplate",
          reason:
            "Archive filename template literal contains a character that is invalid in archive filenames.",
          expected: "no slash, backslash, whitespace, or control characters",
        });
      }
    }
  }

  for (const [index, propagation] of contextPropagations.entries()) {
    const graph = dependencyGraphs[index];

    if (!graph) {
      continue;
    }

    errors.push(
      ...graphValidator.validate({
        config,
        segments,
        graph,
        reachableContextsByVariable: propagation.reachableContextsByVariable,
      }),
    );
  }

  for (const target of config.targets) {
    const baseValues = {
      owner: config.owner,
      repo: config.repo,
      bin: config.binary.name,
      os: target.os,
      arch: config.architectureLabels[target.arch],
      osCase: config.archive.osCase,
    };
    const latestName = expandArchiveNameTemplate(segments, { ...baseValues, version: "v1.2.3" });
    const pinnedName = expandArchiveNameTemplate(segments, {
      ...baseValues,
      version: "release/v1.2.3",
    });
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
    [...contextSetByVariable.entries()].map(([variable, contextSet]) => [
      variable,
      [...contextSet].sort(),
    ]),
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

export function buildInstallLatestGraph(
  config: InstallerConfig,
  segments: ArchiveTemplateSegment[],
): ModeGraph {
  const edges: GraphEdge[] = [
    { derived: "target", source: "os" },
    { derived: "target", source: "arch" },
    ...architectureLabelEdges(),
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

  addArchiveTemplateEdges(
    edges,
    segments,
    config.versionResolver.type === "release_version_file" ? "resolved_version" : undefined,
  );

  return { mode: "install_latest", edges, directContexts: installDirectContexts(config) };
}

export function buildInstallPinGraph(
  config: InstallerConfig,
  segments: ArchiveTemplateSegment[],
): ModeGraph {
  const edges: GraphEdge[] = [
    { derived: "target", source: "os" },
    { derived: "target", source: "arch" },
    ...architectureLabelEdges(),
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

  addArchiveTemplateEdges(
    edges,
    segments,
    templateUsesPlaceholder(segments, "version") ? "pinned_version" : undefined,
  );

  return { mode: "install_pin", edges, directContexts: installDirectContexts(config) };
}

/**
 * `asset_arch_label` is the value actually embedded in `archive_asset_name`
 * via `{arch}`/`{target}`; the canonical `arch` variable and the configured
 * architecture label mapping only reach the filename through this node.
 */
function architectureLabelEdges(): GraphEdge[] {
  return [
    { derived: "asset_arch_label", source: "arch" },
    { derived: "asset_arch_label", source: "architectureLabels.x86_64" },
    { derived: "asset_arch_label", source: "architectureLabels.aarch64" },
  ];
}

function addArchiveTemplateEdges(
  edges: GraphEdge[],
  segments: ArchiveTemplateSegment[],
  versionSymbol: "resolved_version" | "pinned_version" | undefined,
) {
  edges.push({ derived: "archive_asset_name", source: "archive.nameTemplate literal segments" });

  for (const placeholder of ["owner", "repo", "bin", "os"] as const) {
    if (templateUsesPlaceholder(segments, placeholder)) {
      edges.push({ derived: "archive_asset_name", source: placeholder });
    }
  }

  if (templateUsesPlaceholder(segments, "arch") || templateUsesPlaceholder(segments, "target")) {
    edges.push({ derived: "archive_asset_name", source: "asset_arch_label" });
  }

  if (templateUsesPlaceholder(segments, "target")) {
    edges.push({ derived: "archive_asset_name", source: "os" });
  }

  if (versionSymbol && templateUsesPlaceholder(segments, "version")) {
    edges.push({ derived: "archive_asset_name", source: versionSymbol });
  }
}

function installDirectContexts(config: InstallerConfig): DirectContextsByVariable {
  return {
    archive_asset_name: [
      "archive filename context",
      "checksum lookup context",
      "shell literal context",
    ],
    archive_url: ["Release URL context", "shell command argument context"],
    checksum_url: ["Release URL context", "shell command argument context"],
    checksum_lookup_key: ["checksum lookup context"],
    "checksum.fileName": [
      "safe filename context",
      "Release URL path segment context",
      "shell literal context",
    ],
    archive_path: ["local filesystem context", "shell command argument context"],
    resolved_version: ["Git tag context", "Release URL path segment context"],
    pinned_version: ["Git tag context", "Release URL path segment context"],
    ...(config.versionResolver.type === "release_version_file"
      ? {
          "versionResolver.fileName": [
            "safe filename context",
            "Release URL path segment context",
            "shell literal context",
          ],
        }
      : {}),
  };
}

function createArchiveTemplateGraphValidator() {
  return new CompositeGraphValidator([
    archiveFilenameContextRule,
    releaseUrlPathSegmentContextRule,
    shellLiteralContextRule,
    remoteArchiveAssetMustNotFlowIntoLocalArchivePathRule,
  ]);
}

function graphSourceValuesForConfig(config: InstallerConfig): GraphSourceValuesByVariable {
  return {
    owner: { path: "$.owner", value: config.owner },
    repo: { path: "$.repo", value: config.repo },
    bin: { path: "$.binary.name", value: config.binary.name },
    "checksum.fileName": { path: "$.checksum.fileName", value: config.checksum.fileName },
    "archive.nameTemplate literal segments": {
      path: "$.archive.nameTemplate",
      value: config.archive.nameTemplate,
    },
    "architectureLabels.x86_64": {
      path: "$.architectureLabels.x86_64",
      value: config.architectureLabels.x86_64,
    },
    "architectureLabels.aarch64": {
      path: "$.architectureLabels.aarch64",
      value: config.architectureLabels.aarch64,
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
}

const archiveFilenameContextRule: GraphValidationRule = {
  name: "archive-filename-context",
  validate(input) {
    const errors: ValidationError[] = [];
    const sourceValues = graphSourceValuesForConfig(input.config);

    for (const [source, sourceValue] of Object.entries(sourceValues)) {
      const contexts = input.reachableContextsByVariable[source] ?? [];

      if (!contexts.includes("archive filename context")) {
        continue;
      }

      if (source === "archive.nameTemplate literal segments") {
        for (const char of sourceValue.value) {
          if (hasArchiveFilenameHardChars(char) && char !== "{" && char !== "}") {
            errors.push({
              path: sourceValue.path,
              reason:
                "Archive filename template literal contains a character that is invalid in archive filenames.",
              expected: "no slash, backslash, whitespace, or control characters",
            });
            break;
          }
        }
      } else if (hasArchiveFilenameHardChars(sourceValue.value)) {
        errors.push({
          path: sourceValue.path,
          reason:
            "Value flows into archive filename context and contains a forbidden filename character.",
          expected: "no slash, backslash, whitespace, or control characters",
        });
      }
    }

    return errors;
  },
};

const releaseUrlPathSegmentContextRule: GraphValidationRule = {
  name: "release-url-path-segment-context",
  validate(input) {
    const errors: ValidationError[] = [];
    const sourceValues = graphSourceValuesForConfig(input.config);

    for (const [source, sourceValue] of Object.entries(sourceValues)) {
      const contexts = input.reachableContextsByVariable[source] ?? [];

      if (
        contexts.includes("Release URL path segment context") &&
        hasControlChar(sourceValue.value)
      ) {
        errors.push({
          path: sourceValue.path,
          reason:
            "Value flows into a GitHub Release URL path segment and contains a control character.",
          expected: "text that can be UTF-8 percent-encoded as one URL path segment",
        });
      }
    }

    return errors;
  },
};

const shellLiteralContextRule: GraphValidationRule = {
  name: "shell-literal-context",
  validate(input) {
    const errors: ValidationError[] = [];
    const sourceValues = graphSourceValuesForConfig(input.config);

    for (const [source, sourceValue] of Object.entries(sourceValues)) {
      const contexts = input.reachableContextsByVariable[source] ?? [];

      if (contexts.includes("shell literal context") && sourceValue.value.includes("\0")) {
        errors.push({
          path: sourceValue.path,
          reason: "Value cannot be safely embedded as a shell literal because it contains NUL.",
          expected: "string without NUL",
        });
      }
    }

    return errors;
  },
};

const remoteArchiveAssetMustNotFlowIntoLocalArchivePathRule: GraphValidationRule = {
  name: "remote-archive-asset-must-not-flow-into-local-archive-path",
  validate(input) {
    const archivePathContexts = input.reachableContextsByVariable.archive_path ?? [];
    const archiveAssetContexts = input.reachableContextsByVariable.archive_asset_name ?? [];

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
  },
};

function dedupeErrors(errors: ValidationError[]) {
  const seen = new Set<string>();
  return errors.filter((error) => {
    const key = `${error.path}\0${error.reason}\0${error.expected ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function hasControlChar(value: string) {
  for (const char of value) {
    const code = char.charCodeAt(0);

    if (code <= 31 || code === 127) {
      return true;
    }
  }

  return false;
}

function dedupeWarnings(warnings: ArchiveTemplateWarning[]) {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = `${warning.path}\0${warning.reason}\0${warning.recommended}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
