/**
 * Places $extracted_binary into $INSTALL_DIR via a temporary file so a
 * failed copy never clobbers an existing binary.
 */
export function renderInstallBinary(): string {
  return `install_binary() {
  mkdir -p "$INSTALL_DIR" || fail "failed to create install directory: $INSTALL_DIR"
  install_tmp="$INSTALL_DIR/.$BINARY_NAME.tmp.$$"
  rm -f "$install_tmp" || fail "failed to remove stale temporary install file: $install_tmp"
  cp "$extracted_binary" "$install_tmp" || fail "failed to copy binary to temporary install path"
  chmod +x "$install_tmp" || fail "failed to mark binary executable"
  mv "$install_tmp" "$INSTALL_DIR/$BINARY_NAME" || fail "failed to place binary in install directory"
}

`;
}

/**
 * Body fragment of download_and_install(): the temporary workspace and its
 * cleanup trap stay in the caller so the trap covers the whole install flow.
 */
export function renderTempWorkspace(): string {
  return `  tmpdir=$(mktemp -d) || fail "failed to create temporary directory"
  trap 'rm -rf "$tmpdir"' EXIT HUP INT TERM
  archive_path="$tmpdir/archive"
  checksum_path="$tmpdir/checksums"
  extract_dir="$tmpdir/extract"
`;
}
