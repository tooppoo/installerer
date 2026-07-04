export function renderGitTag(): string {
  return `is_valid_git_tag() {
  tag=$1
  case "$tag" in
    ""|latest|/*|*/|*.|@|*//*|*..*|*@{*|*~*|*^*|*:*|*\\?*|*\\**|*\\[*|*\\\\*) return 1 ;;
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
`;
}
