export function renderGitTag(): string {
  return `is_valid_git_tag() {
  tag=$1
  case "$tag" in
    ""|latest|/*|*/|*.|@|*//*|*..*|*@\\{*|*~*|*^*|*:*|*\\?*|*\\**|*\\[*|*\\\\*) return 1 ;;
    *"$CR"*|*"$LF"*) return 1 ;;
  esac
  if LC_ALL=C printf '%s' "$tag" | grep -q '[[:cntrl:][:space:]]'; then
    return 1
  fi
  old_ifs=$IFS
  IFS=/
  set -- $tag
  IFS=$old_ifs
  for segment do
    case "$segment" in
      ""|.*|*.lock) return 1 ;;
    esac
  done
  return 0
}

# A Git tag may legitimately contain '/' (e.g. "release/v1.2.3"), but a value
# extracted from a checksum-index archive filename cannot: '/' would split it
# across path segments. installerer treats such tags as unsupported for
# {version} extraction (issue #111) even though --version pinning still
# accepts them.
is_filename_unsafe_tag() {
  value=$1
  case "$value" in
    */*|*\\\\*) return 0 ;;
  esac
  if LC_ALL=C printf '%s' "$value" | grep -q '[[:cntrl:][:space:]]'; then
    return 0
  fi
  return 1
}
`;
}
