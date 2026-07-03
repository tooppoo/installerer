import {
  expandArchiveNameTemplate,
  parseArchiveNameTemplate,
  validateArchiveFilename,
} from "../archiveTemplate";
import type { InstallerConfig } from "../installerConfig";
import { createRenderContext } from "./renderContext";
import { composeInstallerScript } from "./script";

/**
 * `generatorVersion` is an optional, explicit external input (the
 * installerer CLI's own version, see
 * docs/adr/20260703T144753Z_generator-version-injection-boundary.md), not a
 * value derived from `config`. Passing it does not change the output today
 * because no section renderer reads `RenderContext.generatorVersion` yet;
 * `generateInstaller(config)` remains deterministic for a given config
 * regardless of which (or whether a) generatorVersion is passed.
 */
export function generateInstaller(config: InstallerConfig, generatorVersion?: string): string {
  return composeInstallerScript(createRenderContext(config, generatorVersion));
}

export function previewArchiveNames(config: InstallerConfig, version: string) {
  const template = parseArchiveNameTemplate(config.archive.nameTemplate);
  if (!template.ok) {
    return [];
  }

  return config.targets.map((target) => {
    const name = expandArchiveNameTemplate(template.segments, {
      owner: config.owner,
      repo: config.repo,
      bin: config.binary.name,
      version,
      os: target.os,
      arch: config.architectureLabels[target.arch],
      osCase: config.archive.osCase,
    });
    return {
      ...target,
      name,
      validation: validateArchiveFilename(name, config.archive.format),
    };
  });
}
