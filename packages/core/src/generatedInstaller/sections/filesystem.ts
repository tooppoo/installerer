import { renderCleanupTrap } from "./installTmpFile";

/**
 * Body fragment of download_and_install(): installs the traps that clean up
 * $install_tmp and $tmpdir (see installTmpFile.ts) before creating the
 * temporary workspace, so there is no window in which tmpdir exists but a
 * HUP/INT/TERM would leave it uncleaned.
 *
 * `checksum_index_path` is only emitted when the caller actually performs a
 * checksum-index latest install ({version} archive templates, issue #111);
 * install_pin and the versionless install_latest branch never read it, and
 * ShellCheck (SC2034) flags an unread assignment when nothing in the whole
 * script happens to reference the name elsewhere.
 */
export function renderTempWorkspace(hasChecksumIndex = false): string {
  return `${renderCleanupTrap()}  tmpdir=$(mktemp -d) || fail "failed to create temporary directory"
  archive_path="$tmpdir/archive"
  checksum_path="$tmpdir/checksums"
${hasChecksumIndex ? '  checksum_index_path="$tmpdir/checksums_index"\n' : ""}  extract_dir="$tmpdir/extract"
`;
}
