import type { JsonObject, ValidationError } from "../validation";
import type { KdlDocument, KdlNode } from "./parseKdlText";

/**
 * KDL AST -> `InstallerConfig` input object codec (#108).
 *
 * Only handles KDL-specific shape (canonical subset) validation: unknown
 * nodes/properties, duplicate singletons, unexpected arguments/type
 * annotations, and required-node/property presence. It intentionally does
 * NOT re-check domain semantics already owned by `validateInstallerConfig`
 * (e.g. `archive.format` being `tar.gz`/`zip`, `checksum.algorithm` being
 * `sha256`, safe-filename rules) — those stay in the semantic phase so the
 * codec/semantic responsibility split from the #99 ADR holds.
 *
 * `version-resolver` is deliberately absent from every allowed-child list:
 * per #111, latest-install behavior is now driven by whether
 * `archive.name-template` contains `{version}`, so a `version-resolver` node
 * is rejected as an ordinary unknown child node, not special-cased.
 *
 * Duplicate properties on one node (e.g. `source owner="a" owner="b"`) are
 * not rejected here: `kdljs@0.3.0` assigns properties onto a plain
 * `Record<string, Value>` with last-write-wins semantics and does not retain
 * the discarded value anywhere in its AST (see
 * docs/adr/20260704T103600Z), so this is undetectable from the AST alone.
 * Rejecting it would need a separate pre-parse text scan, which is out of
 * scope for #108.
 */
export type DecodeInstallerConfigKdlResult =
  | { ok: true; input: JsonObject }
  | { ok: false; errors: ValidationError[] };

const ROOT_CHILD_NAMES = [
  "source",
  "binary",
  "archive",
  "checksum",
  "targets",
  "architecture-labels",
  "defaults",
] as const;

const ARCHITECTURE_KEYS = ["x86_64", "aarch64"] as const;
const OS_NAMES = ["linux", "darwin"] as const;

export function decodeInstallerConfigKdl(document: KdlDocument): DecodeInstallerConfigKdlResult {
  const errors: ValidationError[] = [];
  const root = findRootInstallererNode(document, errors);

  if (!root) {
    return { ok: false, errors };
  }

  rejectArguments(root, "installerer", errors);
  rejectTag(root, "installerer", errors);
  rejectAnyProperties(root, "installerer", errors);
  rejectUnknownChildren(root, "installerer", ROOT_CHILD_NAMES, errors);

  const sourceNode = singletonChild(root, "source", "installerer", errors, true);
  const binaryNode = singletonChild(root, "binary", "installerer", errors, true);
  const archiveNode = singletonChild(root, "archive", "installerer", errors, true);
  const checksumNode = singletonChild(root, "checksum", "installerer", errors, true);
  const targetsNode = singletonChild(root, "targets", "installerer", errors, true);
  const architectureLabelsNode = singletonChild(
    root,
    "architecture-labels",
    "installerer",
    errors,
    false,
  );
  const defaultsNode = singletonChild(root, "defaults", "installerer", errors, false);

  const source = sourceNode && decodeSource(sourceNode, "installerer.source", errors);
  const binary = binaryNode && decodeBinary(binaryNode, "installerer.binary", errors);
  const archive = archiveNode && decodeArchive(archiveNode, "installerer.archive", errors);
  const checksum = checksumNode && decodeChecksum(checksumNode, "installerer.checksum", errors);
  const targets = targetsNode && decodeTargets(targetsNode, "installerer.targets", errors);
  const architectureLabels =
    architectureLabelsNode &&
    decodeArchitectureLabels(architectureLabelsNode, "installerer.architecture-labels", errors);
  const defaults = defaultsNode && decodeDefaults(defaultsNode, "installerer.defaults", errors);

  if (
    errors.length > 0 ||
    source === undefined ||
    source.owner === undefined ||
    source.repo === undefined ||
    binary === undefined ||
    binary.name === undefined ||
    binary.pathInArchive === undefined ||
    archive === undefined ||
    archive.format === undefined ||
    archive.nameTemplate === undefined ||
    checksum === undefined ||
    checksum.fileName === undefined ||
    checksum.algorithm === undefined ||
    targets === undefined ||
    targets.some((target) => target.os === undefined || target.arch === undefined)
  ) {
    return { ok: false, errors };
  }

  const input: JsonObject = {
    owner: source.owner,
    repo: source.repo,
    binary: {
      name: binary.name,
      pathInArchive: binary.pathInArchive,
    },
    archive: {
      format: archive.format,
      nameTemplate: archive.nameTemplate,
      ...(archive.osCase !== undefined ? { osCase: archive.osCase } : {}),
    },
    checksum: {
      fileName: checksum.fileName,
      algorithm: checksum.algorithm,
    },
    targets: targets.map((target) => ({ os: target.os, arch: target.arch })),
    ...(architectureLabels !== undefined ? { architectureLabels } : {}),
    ...(defaults !== undefined ? { defaults } : {}),
  };

  return { ok: true, input };
}

function findRootInstallererNode(
  document: KdlDocument,
  errors: ValidationError[],
): KdlNode | undefined {
  const installererNodes = document.filter((node) => node.name === "installerer");
  const otherNodes = document.filter((node) => node.name !== "installerer");

  for (const node of otherNodes) {
    errors.push({
      path: node.name,
      reason: "Unknown top-level node is not supported.",
      expected: "a single installerer node",
    });
  }

  if (installererNodes.length === 0) {
    errors.push({
      path: "installerer",
      reason: "Required root node is missing.",
      expected: "a single installerer node",
    });
    return undefined;
  }

  if (installererNodes.length > 1) {
    errors.push({
      path: "installerer",
      reason: "Root document must contain exactly one installerer node.",
      expected: "a single installerer node",
    });
    return undefined;
  }

  return installererNodes[0];
}

/**
 * Looks up the singleton child named `name` under `parent`, reporting a
 * "required node missing" or "duplicate node" error as appropriate. Callers
 * pass `required: false` for optional singletons (`architecture-labels`,
 * `defaults`), where an absent node is not an error.
 */
function singletonChild(
  parent: KdlNode,
  name: string,
  path: string,
  errors: ValidationError[],
  required: boolean,
): KdlNode | undefined {
  const matches = parent.children.filter((child) => child.name === name);

  if (matches.length > 1) {
    errors.push({
      path: `${path}.${name}`,
      reason: "Duplicate node is not supported.",
      expected: `a single ${name} node`,
    });
    return undefined;
  }

  if (matches.length === 0) {
    if (required) {
      errors.push({
        path: `${path}.${name}`,
        reason: "Required node is missing.",
        expected: `a single ${name} node`,
      });
    }
    return undefined;
  }

  return matches[0];
}

function rejectArguments(node: KdlNode, path: string, errors: ValidationError[]) {
  if (node.values.length > 0) {
    errors.push({
      path,
      reason: "Unexpected positional argument.",
      expected: "no positional arguments",
    });
  }
}

function rejectTag(node: KdlNode, path: string, errors: ValidationError[]) {
  if (node.tags.name !== undefined) {
    errors.push({
      path,
      reason: "Unexpected type annotation.",
      expected: "no type annotation",
    });
  }
}

/**
 * `kdljs@0.3.0`'s AST represents a node with no children block and a node
 * with an empty `{}` block identically, as `children: []` (see
 * docs/adr/20260704T103600Z). Both therefore pass this check; only a
 * *non-empty* child block is rejected here. Detecting an explicit empty
 * block would need a separate pre-parse text scan, which is out of scope
 * for #108 (see the issue's "empty child block" exclusion).
 */
function rejectNonEmptyChildren(node: KdlNode, path: string, errors: ValidationError[]) {
  if (node.children.length > 0) {
    errors.push({
      path,
      reason: "Unexpected child block.",
      expected: "no child block",
    });
  }
}

function rejectAnyProperties(node: KdlNode, path: string, errors: ValidationError[]) {
  for (const key of Object.keys(node.properties)) {
    errors.push({
      path: `${path}.${key}`,
      reason: "Unexpected property.",
      expected: "no properties",
    });
  }
}

function rejectUnknownProperties(
  node: KdlNode,
  path: string,
  allowed: readonly string[],
  errors: ValidationError[],
) {
  const allowedSet = new Set<string>(allowed);

  for (const key of Object.keys(node.properties)) {
    if (!allowedSet.has(key)) {
      errors.push({
        path: `${path}.${key}`,
        reason: "Unknown property is not supported.",
        expected: `one of: ${allowed.join(", ")}`,
      });
    }
  }
}

function rejectUnknownChildren(
  node: KdlNode,
  path: string,
  allowed: readonly string[],
  errors: ValidationError[],
) {
  const allowedSet = new Set<string>(allowed);

  for (const child of node.children) {
    if (!allowedSet.has(child.name)) {
      errors.push({
        path: `${path}.${child.name}`,
        reason: "Unknown child node is not supported.",
        expected: `one of: ${allowed.join(", ")}`,
      });
    }
  }
}

function requireStringProperty(
  node: KdlNode,
  key: string,
  path: string,
  errors: ValidationError[],
): string | undefined {
  const propertyPath = `${path}.${key}`;
  const value = node.properties[key];

  if (value === undefined) {
    errors.push({
      path: propertyPath,
      reason: "Required property is missing.",
      expected: "string property",
    });
    return undefined;
  }

  if (node.tags.properties[key] !== undefined) {
    errors.push({
      path: propertyPath,
      reason: "Unexpected type annotation.",
      expected: "no type annotation",
    });
    return undefined;
  }

  if (typeof value !== "string") {
    errors.push({
      path: propertyPath,
      reason: "Property value must be a string.",
      expected: "string",
    });
    return undefined;
  }

  return value;
}

function optionalStringProperty(
  node: KdlNode,
  key: string,
  path: string,
  errors: ValidationError[],
): string | undefined {
  const propertyPath = `${path}.${key}`;
  const value = node.properties[key];

  if (value === undefined) {
    return undefined;
  }

  if (node.tags.properties[key] !== undefined) {
    errors.push({
      path: propertyPath,
      reason: "Unexpected type annotation.",
      expected: "no type annotation",
    });
    return undefined;
  }

  if (typeof value !== "string") {
    errors.push({
      path: propertyPath,
      reason: "Property value must be a string.",
      expected: "string",
    });
    return undefined;
  }

  return value;
}

function decodeSource(node: KdlNode, path: string, errors: ValidationError[]) {
  rejectArguments(node, path, errors);
  rejectTag(node, path, errors);
  rejectNonEmptyChildren(node, path, errors);
  rejectUnknownProperties(node, path, ["owner", "repo"], errors);

  return {
    owner: requireStringProperty(node, "owner", path, errors),
    repo: requireStringProperty(node, "repo", path, errors),
  };
}

function decodeBinary(node: KdlNode, path: string, errors: ValidationError[]) {
  rejectArguments(node, path, errors);
  rejectTag(node, path, errors);
  rejectNonEmptyChildren(node, path, errors);
  rejectUnknownProperties(node, path, ["name", "path-in-archive"], errors);

  return {
    name: requireStringProperty(node, "name", path, errors),
    pathInArchive: requireStringProperty(node, "path-in-archive", path, errors),
  };
}

function decodeArchive(node: KdlNode, path: string, errors: ValidationError[]) {
  rejectArguments(node, path, errors);
  rejectTag(node, path, errors);
  rejectNonEmptyChildren(node, path, errors);
  rejectUnknownProperties(node, path, ["format", "name-template", "os-case"], errors);

  return {
    format: requireStringProperty(node, "format", path, errors),
    nameTemplate: requireStringProperty(node, "name-template", path, errors),
    osCase: optionalStringProperty(node, "os-case", path, errors),
  };
}

function decodeChecksum(node: KdlNode, path: string, errors: ValidationError[]) {
  rejectArguments(node, path, errors);
  rejectTag(node, path, errors);
  rejectNonEmptyChildren(node, path, errors);
  rejectUnknownProperties(node, path, ["file-name", "algorithm"], errors);

  return {
    fileName: requireStringProperty(node, "file-name", path, errors),
    algorithm: requireStringProperty(node, "algorithm", path, errors),
  };
}

function decodeTargets(node: KdlNode, path: string, errors: ValidationError[]) {
  rejectArguments(node, path, errors);
  rejectTag(node, path, errors);
  rejectAnyProperties(node, path, errors);
  rejectUnknownChildren(node, path, ["target"], errors);

  const targetNodes = node.children.filter((child) => child.name === "target");

  if (targetNodes.length === 0) {
    errors.push({
      path,
      reason: "At least one target is required.",
      expected: "one or more target nodes",
    });
  }

  return targetNodes.map((targetNode, index) =>
    decodeTarget(targetNode, `${path}.target[${index}]`, errors),
  );
}

function decodeTarget(node: KdlNode, path: string, errors: ValidationError[]) {
  rejectArguments(node, path, errors);
  rejectTag(node, path, errors);
  rejectNonEmptyChildren(node, path, errors);
  rejectUnknownProperties(node, path, ["os", "arch"], errors);

  return {
    os: requireStringProperty(node, "os", path, errors),
    arch: requireStringProperty(node, "arch", path, errors),
  };
}

/**
 * Reads the `x86_64`/`aarch64` properties shared by the flat
 * `architecture-labels` node and each per-OS `linux`/`darwin` child.
 * Argument/tag/children-block shape checks are the caller's responsibility,
 * since they differ between the flat node (checked once, up front) and each
 * per-OS child (checked per node).
 */
function decodeArchLabelProperties(node: KdlNode, path: string, errors: ValidationError[]) {
  rejectUnknownProperties(node, path, ARCHITECTURE_KEYS, errors);

  const labels: { x86_64?: string; aarch64?: string } = {};

  for (const key of ARCHITECTURE_KEYS) {
    const value = optionalStringProperty(node, key, path, errors);
    if (value !== undefined) {
      labels[key] = value;
    }
  }

  return labels;
}

function decodeArchitectureLabels(node: KdlNode, path: string, errors: ValidationError[]) {
  rejectTag(node, path, errors);

  const hasFlatProperties = Object.keys(node.properties).length > 0;
  const hasPerOsChildren = node.children.length > 0;

  if (hasFlatProperties && hasPerOsChildren) {
    rejectArguments(node, path, errors);
    errors.push({
      path,
      reason: "Flat architecture-labels properties and per-OS child nodes cannot be combined.",
      expected: "either flat x86_64/aarch64 properties, or linux/darwin child nodes, not both",
    });
    return undefined;
  }

  rejectArguments(node, path, errors);

  if (!hasPerOsChildren) {
    return decodeArchLabelProperties(node, path, errors);
  }

  rejectUnknownChildren(node, path, OS_NAMES, errors);

  const result: {
    linux?: { x86_64?: string; aarch64?: string };
    darwin?: { x86_64?: string; aarch64?: string };
  } = {};

  for (const osName of OS_NAMES) {
    const matches = node.children.filter((child) => child.name === osName);

    if (matches.length > 1) {
      errors.push({
        path: `${path}.${osName}`,
        reason: "Duplicate node is not supported.",
        expected: `a single ${osName} node`,
      });
      continue;
    }

    const osNode = matches[0];
    if (!osNode) {
      continue;
    }

    const osPath = `${path}.${osName}`;
    rejectArguments(osNode, osPath, errors);
    rejectTag(osNode, osPath, errors);
    rejectNonEmptyChildren(osNode, osPath, errors);
    result[osName] = decodeArchLabelProperties(osNode, osPath, errors);
  }

  return result;
}

function decodeDefaults(node: KdlNode, path: string, errors: ValidationError[]) {
  rejectArguments(node, path, errors);
  rejectTag(node, path, errors);
  rejectNonEmptyChildren(node, path, errors);
  rejectUnknownProperties(node, path, ["install-dir"], errors);

  const installDir = optionalStringProperty(node, "install-dir", path, errors);
  return installDir === undefined ? {} : { installDir };
}
