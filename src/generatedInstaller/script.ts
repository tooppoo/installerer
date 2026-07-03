import type { RenderContext } from "./renderContext";
import { renderArchitectureLabel } from "./sections/architectureLabel";
import { renderArchiveName } from "./sections/archiveName";
import { renderVerifySha256 } from "./sections/checksum";
import { renderMain, renderMainInvocation, renderUsage } from "./sections/cli";
import { renderConstants } from "./sections/constants";
import { renderDependencies } from "./sections/dependencies";
import { renderFail } from "./sections/diagnostics";
import { renderCurlDownload } from "./sections/download";
import { renderExtractArchive } from "./sections/extraction";
import { renderGitTag } from "./sections/gitTag";
import { renderHeader } from "./sections/header";
import { renderInstallDir } from "./sections/installDir";
import {
  renderDownloadAndInstall,
  renderInstallLatest,
  renderInstallPin,
} from "./sections/installFlow";
import { renderCleanup, renderInstallBinary } from "./sections/installTmpFile";
import { renderMetadataComment } from "./sections/metadataComment";
import { renderRuntimeValidation } from "./sections/runtimeValidation";
import { renderTarget } from "./sections/target";
import { renderUrlEncoding } from "./sections/urlEncoding";
import { renderVersionResolver } from "./sections/versionResolver";

/**
 * Composes the generated installer from its section renderers. Each section
 * carries its own trailing separators, so this list fully determines the
 * final script order.
 */
export function composeInstallerScript(context: RenderContext): string {
  return [
    renderHeader(),
    renderMetadataComment(context),
    renderConstants(context),
    renderMain(),
    renderFail(),
    renderUsage(),
    renderDependencies(),
    renderUrlEncoding(),
    renderGitTag(),
    renderVersionResolver(context),
    renderRuntimeValidation(),
    renderInstallDir(),
    renderTarget(context),
    renderArchitectureLabel(context),
    renderArchiveName(context),
    renderCurlDownload(),
    renderVerifySha256(),
    renderExtractArchive(),
    renderCleanup(),
    renderInstallBinary(),
    renderDownloadAndInstall(),
    renderInstallLatest(context),
    renderInstallPin(),
    renderMainInvocation(),
  ].join("");
}
