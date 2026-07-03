import type { OsCase, TargetArch, TargetOS } from "../../installerConfig";
import type { RenderContext } from "../renderContext";

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
    x86_64|amd64) arch=x86_64 ;;
    arm64|aarch64) arch=arm64 ;;
    *) fail "unsupported architecture: $arch" ;;
  esac

  case "$os/$arch" in
${targetCases(config.targets)}
    *) fail "unsupported target: $os/$arch" ;;
  esac
${osCaseConversion(config.archive.osCase)}
  printf '%s %s\\n' "$os" "$arch"
}

`;
}

function targetCases(targets: Array<{ os: TargetOS; arch: TargetArch }>) {
  return targets.map((target) => `    ${target.os}/${target.arch}) ;;`).join("\n");
}

function osCaseConversion(osCase: OsCase) {
  if (osCase !== "capitalized") {
    return "";
  }

  return `
  case "$os" in
    linux) os=Linux ;;
    darwin) os=Darwin ;;
  esac
`;
}
