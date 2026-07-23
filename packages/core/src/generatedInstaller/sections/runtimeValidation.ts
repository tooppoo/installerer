export function renderRuntimeValidation(): string {
  return `validate_archive_asset_name() {
  name=$1
  [ -n "$name" ] || fail "archive filename is empty"
  case "$name" in
    */*|*\\\\*) fail "archive filename contains a path separator: $name" ;;
  esac
  if LC_ALL=C printf '%s' "$name" | grep '[[:cntrl:][:space:]]' >/dev/null; then
    fail "archive filename contains whitespace or control characters: $name"
  fi
  case "$name" in
    *"$ARCHIVE_SUFFIX") ;;
    *) fail "archive filename does not end with $ARCHIVE_SUFFIX: $name" ;;
  esac
}

validate_binary_path_in_archive() {
  path=$1
  [ -n "$path" ] || fail "binary.pathInArchive is empty"
  case "$path" in
    -*) fail "binary.pathInArchive must not start with a hyphen: $path" ;;
    /*|*/|*\\\\*) fail "binary.pathInArchive must be a relative file path: $path" ;;
  esac
  old_ifs=$IFS
  IFS=/
  set -- $path
  IFS=$old_ifs
  for segment do
    case "$segment" in
      ""|.|..) fail "binary.pathInArchive contains an unsafe path segment: $path" ;;
    esac
  done
}

`;
}
