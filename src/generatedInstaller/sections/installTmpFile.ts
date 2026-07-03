/**
 * Owns the $install_tmp lifecycle: an unpredictable temporary file inside
 * $INSTALL_DIR that stages the binary via cp/chmod/mv, and the best-effort
 * cleanup that removes it (and $tmpdir) on failure, signal, or normal exit.
 */
export function renderCleanup(): string {
  return `cleanup() {
  if [ -n "\${install_tmp:-}" ]; then
    rm -f "$install_tmp"
  fi
  if [ -n "\${tmpdir:-}" ]; then
    rm -rf "$tmpdir"
  fi
}

cleanup_on_signal() {
  cleanup
  exit 1
}

`;
}

/**
 * Installs the traps that run cleanup(): EXIT covers normal completion and
 * fail()'s exit 1, while HUP/INT/TERM run cleanup then exit non-zero
 * themselves, which in turn fires the EXIT trap. cleanup() tolerates that
 * double execution: rm -f/-rf are no-ops once their target is already gone.
 */
export function renderCleanupTrap(): string {
  return `  trap cleanup EXIT
  trap cleanup_on_signal HUP INT TERM
`;
}

/**
 * Places $extracted_binary into $INSTALL_DIR via a temporary file created
 * with an unpredictable name, so a failed copy/chmod/mv never clobbers an
 * existing binary and never leaves a guessably-named file behind. mktemp
 * creates the file mode-0600, so mode is fixed to 755 explicitly rather than
 * relying on the source file's mode. install_tmp is cleared once mv
 * succeeds, so cleanup() no longer targets the installed binary.
 */
export function renderInstallBinary(): string {
  return `install_binary() {
  mkdir -p "$INSTALL_DIR" || fail "failed to create install directory: $INSTALL_DIR"

  install_tmp=$(mktemp "$INSTALL_DIR/.$BINARY_NAME.tmp.XXXXXX") \\
    || fail "failed to create temporary install file in $INSTALL_DIR"

  cp "$extracted_binary" "$install_tmp" \\
    || fail "failed to copy binary to temporary install path"

  chmod 755 "$install_tmp" \\
    || fail "failed to set binary mode"

  mv "$install_tmp" "$INSTALL_DIR/$BINARY_NAME" \\
    || fail "failed to place binary in install directory"

  install_tmp=
}

`;
}
