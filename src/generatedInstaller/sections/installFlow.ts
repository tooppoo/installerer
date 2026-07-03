import type { InstallerConfig } from "../../installerConfig";
import type { RenderContext } from "../renderContext";
import { renderTempWorkspace } from "./filesystem";
import { renderInstallCompletionMessage } from "./postInstall";
import {
  renderLatestReleaseUrls,
  renderOwnerRepoPathEncoding,
  renderVersionedReleaseUrls,
  renderVersionFileUrl,
} from "./urlConstruction";

export function renderDownloadAndInstall(): string {
  return `download_and_install() {
  archive_url=$1
  checksum_url=$2
  archive_asset_name=$3
${renderTempWorkspace()}
  curl_download "$checksum_url" "$checksum_path" "checksum file"
  curl_download "$archive_url" "$archive_path" "archive"
  verify_sha256
  extract_archive
  install_binary
${renderInstallCompletionMessage()}}

`;
}

export function renderInstallLatest({ config }: RenderContext): string {
  return `install_latest() {
  target=$(detect_target) || exit 1
  set -- $target
  os=$1
  arch=$2
${latestBody(config)}
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
  archive_asset_name=$(render_archive_asset_name "$pinned_version" "$os" "$arch")
  validate_archive_asset_name "$archive_asset_name"
${renderOwnerRepoPathEncoding()}${renderVersionedReleaseUrls("pinned_version")}  download_and_install "$archive_url" "$checksum_url" "$archive_asset_name"
}

`;
}

function latestBody(config: InstallerConfig) {
  if (config.versionResolver.type === "release_version_file") {
    return `${renderOwnerRepoPathEncoding()}${renderVersionFileUrl()}  printf '%s\\n' "installerer: requesting $version_file_url"
  resolved_version=$(read_version_file "$version_file_url") || exit 1
  is_valid_git_tag "$resolved_version" || fail "resolved version is not a valid Git tag: $resolved_version"
  printf '%s\\n' "installerer: resolved latest version $resolved_version"
  archive_asset_name=$(render_archive_asset_name "$resolved_version" "$os" "$arch")
  validate_archive_asset_name "$archive_asset_name"
${renderVersionedReleaseUrls("resolved_version")}  download_and_install "$archive_url" "$checksum_url" "$archive_asset_name"`;
  }

  return `  printf '%s\\n' "installerer: install source latest"
  archive_asset_name=$(render_archive_asset_name "" "$os" "$arch")
  validate_archive_asset_name "$archive_asset_name"
${renderOwnerRepoPathEncoding()}${renderLatestReleaseUrls()}  download_and_install "$archive_url" "$checksum_url" "$archive_asset_name"`;
}
