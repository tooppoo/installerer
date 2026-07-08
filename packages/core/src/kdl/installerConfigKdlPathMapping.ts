/**
 * Maps a domain `ValidationError.path` (e.g. `$.binary.pathInArchive`,
 * `$.targets[0].os`) produced by `validateInstallerConfig` to the
 * corresponding KDL-facing path (e.g. `installerer.binary.path-in-archive`,
 * `installerer.targets.target[0].os`), per #108's semantic validation path
 * mapping table.
 *
 * Every domain path `validateInstallerConfig`/`validateArchiveTemplateForConfig`
 * can currently emit is covered by `STATIC_PATH_MAP` or `TARGET_INDEX_PATTERN`.
 * If a future semantic rule introduces a new, unmapped `$`-rooted path, this
 * function falls back to returning it unchanged rather than throwing:
 * reverse-mapping every possible domain path here would mean duplicating
 * validator internals, so an unmapped path degrades to a domain-facing path
 * in diagnostics instead of crashing the boundary (#108 allows this,
 * provided the reason is recorded — this comment is that record).
 */
export function domainPathToKdlFacingPath(path: string): string {
  const staticMatch = STATIC_PATH_MAP[path];
  if (staticMatch !== undefined) {
    return staticMatch;
  }

  const targetMatch = TARGET_INDEX_PATTERN.exec(path);
  if (targetMatch) {
    const [, index = "", suffix = ""] = targetMatch;
    return `installerer.targets.target[${index}]${suffix}`;
  }

  return path;
}

const STATIC_PATH_MAP: Record<string, string> = {
  "$.owner": "installerer.source.owner",
  "$.repo": "installerer.source.repo",
  "$.binary": "installerer.binary",
  "$.binary.name": "installerer.binary.name",
  "$.binary.pathInArchive": "installerer.binary.path-in-archive",
  "$.archive": "installerer.archive",
  "$.archive.format": "installerer.archive.format",
  "$.archive.nameTemplate": "installerer.archive.name-template",
  "$.archive.osCase": "installerer.archive.os-case",
  "$.checksum": "installerer.checksum",
  "$.checksum.fileName": "installerer.checksum.file-name",
  "$.checksum.algorithm": "installerer.checksum.algorithm",
  "$.targets": "installerer.targets",
  "$.architectureLabels": "installerer.architecture-labels",
  "$.architectureLabels.x86_64": "installerer.architecture-labels.x86_64",
  "$.architectureLabels.aarch64": "installerer.architecture-labels.aarch64",
  "$.architectureLabels.linux": "installerer.architecture-labels.linux",
  "$.architectureLabels.linux.x86_64": "installerer.architecture-labels.linux.x86_64",
  "$.architectureLabels.linux.aarch64": "installerer.architecture-labels.linux.aarch64",
  "$.architectureLabels.darwin": "installerer.architecture-labels.darwin",
  "$.architectureLabels.darwin.x86_64": "installerer.architecture-labels.darwin.x86_64",
  "$.architectureLabels.darwin.aarch64": "installerer.architecture-labels.darwin.aarch64",
  "$.defaults": "installerer.defaults",
  "$.defaults.installDir": "installerer.defaults.install-dir",
};

const TARGET_INDEX_PATTERN = /^\$\.targets\[(\d+)\](\.os|\.arch)?$/;
