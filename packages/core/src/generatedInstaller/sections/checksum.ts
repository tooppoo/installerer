/**
 * Checksum handling, split across the archive download (issue #43): the
 * expected value is looked up, format-checked, and normalized from
 * $checksum_path alone, and only the final comparison needs the downloaded
 * $archive_path. Both halves read variables download_and_install() sets.
 */
export function renderChecksumVerification(): string {
  return `is_valid_sha256_hex() {
  value=$1
  [ "\${#value}" -eq 64 ] || return 1
  # An explicit character list rather than [[:xdigit:]] or an a-f range: both a
  # named class and a bracket range are locale-dependent, and this must accept
  # exactly the same characters on every host.
  case "$value" in
    *[!0123456789ABCDEFabcdef]*) return 1 ;;
  esac
  return 0
}

# Runs before the archive download, so a checksum file that cannot verify
# anything costs no transfer and a malformed value is reported as itself
# instead of resurfacing later as a mismatch.
resolve_expected_checksum() {
  expected_checksum=$(awk -v name="$archive_asset_name" '$2 == name { print $1; found=1; exit } END { if (!found) exit 1 }' "$checksum_path") \\
    || fail "checksum entry not found for $archive_asset_name"
  [ -n "$expected_checksum" ] || fail "checksum entry not found for $archive_asset_name"
  # The rejected value is Release content and is deliberately not echoed back;
  # the asset name and the expected shape are what a maintainer acts on.
  is_valid_sha256_hex "$expected_checksum" \\
    || fail "malformed checksum for $archive_asset_name: expected 64 hexadecimal characters"
  # Normalizing once here, not per backend, is what makes an uppercase checksum
  # file behave identically under sha256sum -c and the shasum string compare.
  expected_checksum=$(printf '%s' "$expected_checksum" | tr 'ABCDEF' 'abcdef')
}

verify_sha256() {
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
