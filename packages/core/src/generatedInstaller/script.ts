import type { RenderContext } from "./renderContext";
import { renderArchitectureLabel } from "./sections/architectureLabel";
import { renderArchiveName, renderArchiveNamePrefixSuffix } from "./sections/archiveName";
import { renderChecksumVerification } from "./sections/checksum";
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
import { renderCheckRequirements } from "./sections/requirementChecks";
import { renderPrintRequirements } from "./sections/requirements";
import { renderRuntimeValidation } from "./sections/runtimeValidation";
import { renderTarget } from "./sections/target";
import { renderUrlEncoding } from "./sections/urlEncoding";
import { renderVersionResolution } from "./sections/versionResolution";

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
    renderPrintRequirements(context),
    renderCheckRequirements(context),
    renderDependencies(context),
    renderUrlEncoding(),
    renderGitTag(),
    renderVersionResolution(context),
    renderRuntimeValidation(),
    renderInstallDir(),
    renderTarget(context),
    renderArchitectureLabel(context),
    renderArchiveName(context),
    renderArchiveNamePrefixSuffix(context),
    renderCurlDownload(),
    renderChecksumVerification(),
    renderExtractArchive(),
    renderCleanup(),
    renderInstallBinary(),
    renderDownloadAndInstall(),
    renderInstallLatest(context),
    renderInstallPin(),
    renderMainInvocation(),
  ].join("");
}
