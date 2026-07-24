import { templateUsesPlaceholder, type ArchiveTemplateSegment } from "../../archiveTemplate";
import type { RenderContext } from "../renderContext";
import { renderTempWorkspace } from "./filesystem";
import { renderInstallCompletionMessage } from "./postInstall";
import {
  renderChecksumIndexUrl,
  renderLatestReleaseUrls,
  renderOwnerRepoPathEncoding,
  renderVersionedReleaseUrls,
} from "./urlConstruction";

/**
 * Shared by every install path once archive_url/checksum_url/archive_asset_name
 * are known. Assumes the caller already set up the workspace (renderTempWorkspace)
 * — tmpdir must exist before a with-{version} latest install's checksum-index
 * fetch, which happens before this function's archive_asset_name is known.
 *
 * The step order is load-bearing: resolve_expected_checksum runs between the
 * two downloads so an unusable checksum file fails without transferring the
 * archive (issue #43).
 */
export function renderDownloadAndInstall(): string {
  return `download_and_install() {
  archive_url=$1
  checksum_url=$2
  archive_asset_name=$3
  curl_download "$checksum_url" "$checksum_path" "checksum file"
  resolve_expected_checksum
  curl_download "$archive_url" "$archive_path" "archive"
  verify_sha256
  extract_archive
  install_binary
${renderInstallCompletionMessage()}}

`;
}

export function renderInstallLatest({ templateSegments }: RenderContext): string {
  return `install_latest() {
  target=$(detect_target) || exit 1
  set -- $target
  os=$1
  arch=$2
  asset_arch_label=$(resolve_asset_arch_label "$os" "$arch") || exit 1
${latestBody(templateSegments)}
}

`;
}

export function renderInstallPin(): string {
  return `install_pin() {
  pinned_version=$1
  is_valid_git_tag "$pinned_version" || fail "--version must be a valid Git tag and must not be latest"
  target=$(detect_target) || exit 1
  set -- $target
  os=$1
  arch=$2
  asset_arch_label=$(resolve_asset_arch_label "$os" "$arch") || exit 1
${renderTempWorkspace()}  archive_asset_name=$(render_archive_asset_name "$pinned_version" "$os" "$asset_arch_label")
  validate_archive_asset_name "$archive_asset_name"
${renderOwnerRepoPathEncoding()}${renderVersionedReleaseUrls("pinned_version")}  download_and_install "$archive_url" "$checksum_url" "$archive_asset_name"
}

`;
}

/**
 * With {version}: the archive filename (and so the release tag) isn't known
 * yet, so the workspace is set up first, the checksum file is fetched from
 * the latest release as a version-resolution index, and the extracted tag
 * is used to build tag-specific URLs for the real download (issue #111).
 * Without {version}: unchanged direct latest-release download, no tag
 * resolution.
 */
function latestBody(templateSegments: ArchiveTemplateSegment[]) {
  if (templateUsesPlaceholder(templateSegments, "version")) {
    return `${renderTempWorkspace(true)}${renderOwnerRepoPathEncoding()}${renderChecksumIndexUrl()}  curl_download "$checksum_index_url" "$checksum_index_path" "checksum index"
  prefix=$(render_archive_asset_name_prefix "$os" "$asset_arch_label")
  suffix=$(render_archive_asset_name_suffix "$os" "$asset_arch_label")
  resolved_version=$(resolve_expected_release_tag "$checksum_index_path" "$prefix" "$suffix") || exit 1
  printf '%s\\n' "installerer: resolved latest version $resolved_version"
  archive_asset_name=$(render_archive_asset_name "$resolved_version" "$os" "$asset_arch_label")
  validate_archive_asset_name "$archive_asset_name"
${renderVersionedReleaseUrls("resolved_version")}  download_and_install "$archive_url" "$checksum_url" "$archive_asset_name"`;
  }

  return `${renderTempWorkspace()}  printf '%s\\n' "installerer: install source latest"
  archive_asset_name=$(render_archive_asset_name "" "$os" "$asset_arch_label")
  validate_archive_asset_name "$archive_asset_name"
${renderOwnerRepoPathEncoding()}${renderLatestReleaseUrls()}  download_and_install "$archive_url" "$checksum_url" "$archive_asset_name"`;
}
