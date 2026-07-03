import { renderCleanupTrap } from "./installTmpFile";

/**
 * Body fragment of download_and_install(): creates the temporary workspace
 * and installs the traps that clean it up (and $install_tmp, see
 * installTmpFile.ts) on failure, signal, or normal exit.
 */
export function renderTempWorkspace(): string {
  return `  tmpdir=$(mktemp -d) || fail "failed to create temporary directory"
${renderCleanupTrap()}  archive_path="$tmpdir/archive"
  checksum_path="$tmpdir/checksums"
  extract_dir="$tmpdir/extract"
`;
}
