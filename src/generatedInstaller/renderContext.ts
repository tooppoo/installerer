import {
  archiveFormatSuffix,
  parseArchiveNameTemplate,
  type ArchiveTemplateSegment,
} from "../archiveTemplate";
import type { InstallerConfig } from "../installerConfig";

/**
 * Pre-computed inputs shared by the section renderers. Sections must not
 * re-derive these from the raw config so that parsing happens exactly once.
 *
 * `generatorVersion` is the injection boundary for the installerer CLI's own
 * version (docs/adr/20260703T133536Z_cli-version-source.md), decided in
 * docs/adr/20260703T144753Z_generator-version-injection-boundary.md. It is
 * populated only when a caller passes one explicitly; nothing under
 * `src/generatedInstaller/` reads `package.json` or `process.env` itself.
 * No section renderer consumes this field yet (issue #79 scopes that out;
 * whitelisting it into `renderMetadataComment` is a separate future issue).
 */
export type RenderContext = {
  config: InstallerConfig;
  templateSegments: ArchiveTemplateSegment[];
  archiveSuffix: string;
  generatorVersion: string | undefined;
};

export function createRenderContext(
  config: InstallerConfig,
  generatorVersion?: string,
): RenderContext {
  const template = parseArchiveNameTemplate(config.archive.nameTemplate);
  if (!template.ok) {
    throw new Error(template.errors.map((error) => `${error.path}: ${error.reason}`).join("\n"));
  }

  return {
    config,
    templateSegments: template.segments,
    archiveSuffix: archiveFormatSuffix(config.archive.format),
    generatorVersion,
  };
}
