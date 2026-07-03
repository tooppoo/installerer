import type { ArchiveTemplateSegment } from "../../archiveTemplate";
import type { RenderContext } from "../renderContext";
import { shellLiteral } from "../shell";

export function renderArchiveName({ templateSegments }: RenderContext): string {
  return `render_archive_asset_name() {
  version=$1
  os=$2
  asset_arch_label=$3
  target="\${os}_\${asset_arch_label}"
  printf '%s' ${renderTemplatePrintfArguments(templateSegments)}
  printf '\\n'
}

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
