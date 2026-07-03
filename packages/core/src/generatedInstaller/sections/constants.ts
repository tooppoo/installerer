import type { RenderContext } from "../renderContext";
import { shellLiteral } from "../shell";

export function renderConstants({ config, archiveSuffix }: RenderContext): string {
  return `OWNER=${shellLiteral(config.owner)}
REPO=${shellLiteral(config.repo)}
BINARY_NAME=${shellLiteral(config.binary.name)}
BINARY_PATH_IN_ARCHIVE=${shellLiteral(config.binary.pathInArchive)}
CHECKSUM_FILE_NAME=${shellLiteral(config.checksum.fileName)}
DEFAULT_INSTALL_DIR=${shellLiteral(config.defaults.installDir)}
INSTALL_DIR=
ARCHIVE_FORMAT=${shellLiteral(config.archive.format)}
ARCHIVE_SUFFIX=${shellLiteral(archiveSuffix)}
${config.versionResolver.type === "release_version_file" ? `VERSION_FILE_NAME=${shellLiteral(config.versionResolver.fileName)}` : ""}
LF='
'
CR=$(printf '\\r')

`;
}
