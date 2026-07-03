/**
 * Verifies $archive_path against the entry for $archive_asset_name in
 * $checksum_path; the variables are set by download_and_install().
 */
export function renderVerifySha256(): string {
  return `verify_sha256() {
  expected_checksum=$(awk -v name="$archive_asset_name" '$2 == name { print $1; found=1; exit } END { if (!found) exit 1 }' "$checksum_path") \\
    || fail "checksum entry not found for $archive_asset_name"
  case "$CHECKSUM_COMMAND" in
    sha256sum)
      printf '%s  %s\\n' "$expected_checksum" "$archive_path" | sha256sum -c - >/dev/null \\
        || fail "archive checksum mismatch"
      ;;
    shasum)
      actual_checksum=$(shasum -a 256 "$archive_path" | awk '{ print $1 }') \\
        || fail "failed to compute archive checksum"
      [ "$actual_checksum" = "$expected_checksum" ] || fail "archive checksum mismatch"
      ;;
    *)
      fail "checksum command was not initialized"
      ;;
  esac
}

`;
}
