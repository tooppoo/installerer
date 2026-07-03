import {
  expandArchiveNameTemplate,
  parseArchiveNameTemplate,
  validateArchiveFilename,
} from "../archiveTemplate";
import type { InstallerConfig } from "../installerConfig";
import { createRenderContext } from "./renderContext";
import { composeInstallerScript } from "./script";

export function generateInstaller(config: InstallerConfig): string {
  return composeInstallerScript(createRenderContext(config));
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
