/**
 * Extracts $BINARY_PATH_IN_ARCHIVE from $archive_path into $extract_dir and
 * leaves the validated result in $extracted_binary for install_binary().
 */
export function renderExtractArchive(): string {
  return `extract_archive() {
  mkdir -p "$extract_dir" || fail "failed to create extract directory"
  case "$ARCHIVE_FORMAT" in
    tar.gz)
      tar -xzf "$archive_path" -C "$extract_dir" -- "$BINARY_PATH_IN_ARCHIVE" \\
        || fail "failed to extract $BINARY_PATH_IN_ARCHIVE from tar.gz archive"
      ;;
    zip)
      unzip -q "$archive_path" "$BINARY_PATH_IN_ARCHIVE" -d "$extract_dir" \\
        || fail "failed to extract $BINARY_PATH_IN_ARCHIVE from zip archive"
      ;;
    *)
      fail "unsupported archive format: $ARCHIVE_FORMAT"
      ;;
  esac
  printf '%s\\n' "installerer: extracted files:"
  ls -laR "$extract_dir"

  extracted_binary="$extract_dir/$BINARY_PATH_IN_ARCHIVE"
  [ ! -L "$extracted_binary" ] || fail "archive binary entry must not be a symlink: $BINARY_PATH_IN_ARCHIVE"
  [ -f "$extracted_binary" ] || fail "archive binary entry is not a regular file: $BINARY_PATH_IN_ARCHIVE"
}

`;
}
