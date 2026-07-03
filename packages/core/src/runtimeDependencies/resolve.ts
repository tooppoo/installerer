import type { InstallerConfig } from "../installerConfig";
import {
  ARCHIVE_FORMAT_DEPENDENCIES,
  BASE_COMMAND_DEPENDENCIES,
  CHECKSUM_DEPENDENCY,
  FILESYSTEM_PREMISES,
  NETWORK_PREMISES,
  SHELL_PREMISE,
} from "./definitions";
import type { ResolvedRuntimeDependencies, RuntimeDependencyDefinition } from "./model";

const SAFE_COMMAND_NAME_PATTERN = /^[A-Za-z0-9._+-]+$/;

/**
 * Restricts a dependency's command name to a safe shell-command character
 * set, independent of the quoting renderers apply. Defense in depth: even if
 * a future definition's command string were attacker-influenced, this stops
 * it from resembling shell syntax before it ever reaches a renderer.
 */
export function assertSafeCommandName(command: string): void {
  if (!SAFE_COMMAND_NAME_PATTERN.test(command)) {
    throw new Error(`unsafe runtime dependency command name: ${command}`);
  }
}

function assertSafeDependency(dependency: RuntimeDependencyDefinition): void {
  switch (dependency.check.type) {
    case "command":
      assertSafeCommandName(dependency.check.command);
      return;
    case "any-command":
    case "all-commands":
      dependency.check.commands.forEach(assertSafeCommandName);
      return;
  }
}

export function resolveRuntimeDependencies(config: InstallerConfig): ResolvedRuntimeDependencies {
  const dependencies: RuntimeDependencyDefinition[] = [
    ...BASE_COMMAND_DEPENDENCIES,
    ARCHIVE_FORMAT_DEPENDENCIES[config.archive.format],
    CHECKSUM_DEPENDENCY,
  ];

  dependencies.forEach(assertSafeDependency);

  return {
    dependencies,
    premises: [SHELL_PREMISE, ...NETWORK_PREMISES, ...FILESYSTEM_PREMISES],
  };
}
