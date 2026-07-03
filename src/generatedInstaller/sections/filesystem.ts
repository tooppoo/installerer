import { renderCleanupTrap } from "./installTmpFile";

/**
 * Body fragment of download_and_install(): installs the traps that clean up
 * $install_tmp and $tmpdir (see installTmpFile.ts) before creating the
 * temporary workspace, so there is no window in which tmpdir exists but a
 * HUP/INT/TERM would leave it uncleaned.
 */
export function renderTempWorkspace(): string {
  return `${renderCleanupTrap()}  tmpdir=$(mktemp -d) || fail "failed to create temporary directory"
  archive_path="$tmpdir/archive"
  checksum_path="$tmpdir/checksums"
  extract_dir="$tmpdir/extract"
`;
}
