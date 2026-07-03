import {
  archiveFormatSuffix,
  parseArchiveNameTemplate,
  type ArchiveTemplateSegment,
} from "../archiveTemplate";
import type { InstallerConfig } from "../installerConfig";

/**
 * Pre-computed inputs shared by the section renderers. Sections must not
 * re-derive these from the raw config so that parsing happens exactly once.
 */
export type RenderContext = {
  config: InstallerConfig;
  templateSegments: ArchiveTemplateSegment[];
  archiveSuffix: string;
};

export function createRenderContext(config: InstallerConfig): RenderContext {
  const template = parseArchiveNameTemplate(config.archive.nameTemplate);
  if (!template.ok) {
    throw new Error(template.errors.map((error) => `${error.path}: ${error.reason}`).join("\n"));
  }

  return {
    config,
    templateSegments: template.segments,
    archiveSuffix: archiveFormatSuffix(config.archive.format),
  };
}
