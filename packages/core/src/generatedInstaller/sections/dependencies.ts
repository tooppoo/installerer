import type { RenderContext } from "../renderContext";
import {
  ARCHIVE_FORMAT_COMMAND_NAMES,
  ARCHIVE_FORMAT_DEPENDENCIES,
  CHECKSUM_DEPENDENCY,
} from "../../runtimeDependencies/definitions";
import type { RuntimeDependencyDefinition } from "../../runtimeDependencies/model";
import { renderCheckCondition } from "./requirementChecks";
import { shellLiteral } from "../shell";

function commandNameOf(dependency: RuntimeDependencyDefinition): string {
  if (dependency.check.type !== "command") {
    throw new Error(`expected a single-command dependency: ${dependency.id}`);
  }
  return dependency.check.command;
}

/**
 * ids of the per-archive-format dependencies (e.g. `tar`, `unzip`). Excluded
 * from the plain `require_command` list below because the `case
 * "$ARCHIVE_FORMAT"` block requires *both* archive-format commands
 * unconditionally (see test/helpers/staticAssertions.ts) — a resolved
 * dependency list only ever contains the one matching the config's format,
 * so the non-selected arm cannot come from `resolvedDependencies` itself.
 */
const ARCHIVE_DEPENDENCY_IDS = new Set(
  Object.values(ARCHIVE_FORMAT_DEPENDENCIES).map((dependency) => dependency.id),
);

/**
 * Generates the pre-install dependency gate from the same resolved
 * dependency list `--requirements` / `--check-requirements` use (issue #75),
 * so command names and the checksum alternative are never hand-duplicated.
 */
export function renderDependencies({ config, resolvedDependencies }: RenderContext): string {
  const otherDependencies = resolvedDependencies.dependencies.filter(
    (dependency) =>
      !ARCHIVE_DEPENDENCY_IDS.has(dependency.id) && dependency.id !== CHECKSUM_DEPENDENCY.id,
  );
  const commandDependencies = otherDependencies.filter(
    (dependency): dependency is RuntimeDependencyDefinition & { check: { type: "command" } } =>
      dependency.check.type === "command",
  );
  // Any dependency that is neither a plain "command" check, the checksum
  // alternative, nor the archive-format command falls back to a generic
  // fail-fast gate built from the same condition builder `--check-requirements`
  // uses, so an "any-command"/"all-commands" dependency added later can never
  // be silently skipped here the way a hand-enumerated check-type list would.
  // With today's dependency set this list is always empty and this section
  // renders nothing.
  const genericDependencies = otherDependencies.filter(
    (dependency) => dependency.check.type !== "command",
  );

  // Matched by id, not by `check.type === "any-command"`: a future
  // any-command dependency unrelated to checksums must not be picked up here.
  const checksumDependency = resolvedDependencies.dependencies.find(
    (dependency) => dependency.id === CHECKSUM_DEPENDENCY.id,
  );
  if (!checksumDependency || checksumDependency.check.type !== "any-command") {
    throw new Error("expected the checksum dependency in resolvedDependencies");
  }
  const [checksumCommandA, checksumCommandB] = checksumDependency.check.commands;
  if (!checksumCommandA || !checksumCommandB) {
    throw new Error("expected exactly two checksum alternative commands");
  }

  // The dependency matching this config's selected archive format is present
  // in resolvedDependencies; only the non-selected format's command name
  // still has to come from the static map (see ARCHIVE_DEPENDENCY_IDS above).
  const selectedArchiveDependency = resolvedDependencies.dependencies.find((dependency) =>
    ARCHIVE_DEPENDENCY_IDS.has(dependency.id),
  );
  if (!selectedArchiveDependency) {
    throw new Error("expected an archive-format dependency in resolvedDependencies");
  }
  const archiveCommandNames = {
    ...ARCHIVE_FORMAT_COMMAND_NAMES,
    [config.archive.format]: commandNameOf(selectedArchiveDependency),
  };

  const requireLines = commandDependencies
    .map((dependency) => `  require_command ${shellLiteral(commandNameOf(dependency))}`)
    .join("\n");

  const genericGateLines = genericDependencies
    .map((dependency) => {
      const condition = renderCheckCondition(dependency.check);
      return `  ${condition} || fail ${shellLiteral(`${dependency.label} is required`)}`;
    })
    .join("\n");

  const bodyLines = [requireLines, genericGateLines].filter((lines) => lines.length > 0);

  return `require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

check_runtime_dependencies() {
${bodyLines.join("\n")}
  case "$ARCHIVE_FORMAT" in
    tar.gz) require_command ${shellLiteral(archiveCommandNames["tar.gz"])} ;;
    zip) require_command ${shellLiteral(archiveCommandNames.zip)} ;;
    *) fail "unsupported archive format: $ARCHIVE_FORMAT" ;;
  esac
  if command -v ${shellLiteral(checksumCommandA)} >/dev/null 2>&1; then
    CHECKSUM_COMMAND=${shellLiteral(checksumCommandA)}
  elif command -v ${shellLiteral(checksumCommandB)} >/dev/null 2>&1; then
    CHECKSUM_COMMAND=${shellLiteral(checksumCommandB)}
  else
    fail "${checksumCommandA} or ${checksumCommandB} is required"
  fi
}

`;
}
