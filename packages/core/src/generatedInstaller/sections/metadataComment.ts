import type { RenderContext } from "../renderContext";

const GENERATOR_NAME = "installerer";
const GENERATOR_SOURCE_URL = "https://github.com/tooppoo/installerer";

/**
 * Renders a human-readable, whitelist-only summary of the effective
 * (validated/normalized) InstallerConfig as a shell comment block. This is
 * metadata for review/diagnostics/issue reports, not a runtime config: the
 * installer never parses it, and runtime behavior is decided solely by the
 * generated shell code around it (issue #74).
 */
export function renderMetadataComment({ config }: RenderContext): string {
  const fields: Array<[string, string]> = [
    ["generator.name", GENERATOR_NAME],
    ["generator.sourceUrl", GENERATOR_SOURCE_URL],
    ["owner", config.owner],
    ["repo", config.repo],
    ["binary.name", config.binary.name],
    ["binary.pathInArchive", config.binary.pathInArchive],
    ["versionResolver.type", config.versionResolver.type],
    ...(config.versionResolver.type === "release_version_file"
      ? ([["versionResolver.fileName", config.versionResolver.fileName]] as Array<[string, string]>)
      : []),
    ["archive.format", config.archive.format],
    ["archive.nameTemplate", config.archive.nameTemplate],
    ["archive.osCase", config.archive.osCase],
    ["checksum.fileName", config.checksum.fileName],
    ["checksum.algorithm", config.checksum.algorithm],
    ["defaults.installDir", config.defaults.installDir],
    ["targets", config.targets.map((target) => `${target.os}/${target.arch}`).join(", ")],
  ];

  const lines = fields.map(([key, value]) => `#   ${key}: ${sanitizeMetadataValue(value)}`);

  return `#
# Effective installer configuration:
${lines.join("\n")}

`;
}

/**
 * Defends the comment block itself: a value carrying a raw newline could
 * otherwise terminate the comment line and let the remainder execute as
 * shell code. Control characters are rendered as visible escapes instead of
 * being emitted literally, without relying on regex unicode escapes.
 */
function sanitizeMetadataValue(value: string): string {
  return Array.from(value)
    .map((char) => {
      if (char === "\n") {
        return "\\n";
      }
      if (char === "\r") {
        return "\\r";
      }
      if (char === "\t") {
        return "\\t";
      }
      const code = char.codePointAt(0) ?? 0;
      const isControlCharacter = code < 0x20 || code === 0x7f;
      return isControlCharacter ? `\\x${code.toString(16).padStart(2, "0")}` : char;
    })
    .join("");
}
