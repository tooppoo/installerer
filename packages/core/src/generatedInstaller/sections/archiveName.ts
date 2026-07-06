import type { ArchiveTemplateSegment } from "../../archiveTemplate";
import type { OsCase } from "../../installerConfig";
import type { RenderContext } from "../renderContext";
import { shellLiteral } from "../shell";

/**
 * `render_archive_asset_name` receives the canonical OS name and converts it
 * to the configured `archive.osCase` spelling here, where the OS name becomes
 * part of an asset name — runtime detection and label resolution upstream
 * only ever see the canonical value.
 */
export function renderArchiveName({ config, templateSegments }: RenderContext): string {
  return `render_archive_asset_name() {
  version=$1
  os=$2
  asset_arch_label=$3
${osCaseConversion(config.archive.osCase)}  target="\${os}_\${asset_arch_label}"
  printf '%s' ${renderTemplatePrintfArguments(templateSegments)}
  printf '\\n'
}

`;
}

function osCaseConversion(osCase: OsCase) {
  if (osCase !== "capitalized") {
    return "";
  }

  return `  case "$os" in
    linux) os=Linux ;;
    darwin) os=Darwin ;;
  esac
`;
}

function renderTemplatePrintfArguments(segments: ArchiveTemplateSegment[]) {
  return segments
    .map((segment) => {
      if (segment.type === "literal") {
        return shellLiteral(segment.value);
      }

      const variable =
        segment.name === "owner"
          ? "OWNER"
          : segment.name === "repo"
            ? "REPO"
            : segment.name === "bin"
              ? "BINARY_NAME"
              : segment.name === "arch"
                ? "asset_arch_label"
                : segment.name;
      return `"$${variable}"`;
    })
    .join(" ");
}
