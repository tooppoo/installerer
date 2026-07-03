import type { RenderContext } from "../renderContext";

/**
 * Emitted only for the release_version_file resolver; the latest_asset
 * resolver needs no version lookup helper in the generated script.
 */
export function renderVersionResolver({ config }: RenderContext): string {
  return `${
    config.versionResolver.type === "release_version_file"
      ? `
read_version_file() {
  url=$1
  content=$(curl -fsSL "$url" && printf x) || fail "failed to resolve latest version from $url"
  content=\${content%x}
  while true; do
    case "$content" in
      *[[:space:]]) content=\${content%?} ;;
      *) break ;;
    esac
  done
  [ -n "$content" ] || fail "VERSION file is empty"
  case "$content" in
    *"$CR"*|*"$LF"*) fail "VERSION file must contain a single line" ;;
  esac
  printf '%s' "$content"
}
`
      : ""
  }
`;
}
