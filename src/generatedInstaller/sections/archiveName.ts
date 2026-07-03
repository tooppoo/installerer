import type { ArchiveTemplateSegment } from "../../archiveTemplate";
import type { RenderContext } from "../renderContext";
import { shellLiteral } from "../shell";

export function renderArchiveName({ templateSegments }: RenderContext): string {
  return `render_archive_asset_name() {
  version=$1
  os=$2
  arch=$3
  target="\${os}_\${arch}"
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
              : segment.name;
      return `"$${variable}"`;
    })
    .join(" ");
}
