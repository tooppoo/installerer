import type { TargetArch, TargetOS } from "../../installerConfig";
import type { RenderContext } from "../renderContext";

/**
 * detect_target() outputs the canonical OS/architecture pair only. Asset-name
 * concerns — `archive.osCase` casing and `architectureLabels` resolution —
 * are applied later, in render_archive_asset_name() and
 * resolve_asset_arch_label(), so every consumer of detect_target sees the
 * canonical values.
 */
export function renderTarget({ config }: RenderContext): string {
  return `detect_target() {
  os=$(uname -s | tr '[:upper:]' '[:lower:]')
  arch=$(uname -m)

  case "$os" in
    linux) os=linux ;;
    darwin) os=darwin ;;
    *) fail "unsupported OS: $os" ;;
  esac

  case "$arch" in
    x86_64) arch=x86_64 ;;
    aarch64|arm64) arch=aarch64 ;;
    *) fail "unsupported architecture: $arch" ;;
  esac

  case "$os/$arch" in
${targetCases(config.targets)}
    *) fail "unsupported target: $os/$arch" ;;
  esac

  printf '%s %s\\n' "$os" "$arch"
}

`;
}

function targetCases(targets: Array<{ os: TargetOS; arch: TargetArch }>) {
  return targets.map((target) => `    ${target.os}/${target.arch}) ;;`).join("\n");
}
