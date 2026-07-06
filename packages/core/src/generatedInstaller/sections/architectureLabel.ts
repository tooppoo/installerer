import { CANONICAL_ARCHITECTURES } from "../../architectureLabels";
import { TARGET_OPERATING_SYSTEMS } from "../../installerConfigValidators";
import type { InstallerConfig } from "../../installerConfig";
import type { RenderContext } from "../renderContext";
import { shellLiteral } from "../shell";

/**
 * Resolves the canonical OS/architecture pair detected by `detect_target()`
 * to the configured `asset_arch_label`, embedded in Release asset names via
 * `{arch}`/`{target}`. This is a distinct stage from runtime canonicalization:
 * `canonical_os`/`canonical_arch` are fixed (`linux` | `darwin`, `x86_64` |
 * `aarch64`), while `asset_arch_label` comes from `architectureLabels` — one
 * mapping per OS — and may be a preset or a custom value.
 */
export function renderArchitectureLabel({ config }: RenderContext): string {
  return `resolve_asset_arch_label() {
  canonical_os=$1
  canonical_arch=$2

  case "$canonical_os/$canonical_arch" in
${architectureLabelCases(config.architectureLabels)}
    *) fail "unsupported target: $canonical_os/$canonical_arch" ;;
  esac

  printf '%s\\n' "$asset_arch_label"
}

`;
}

function architectureLabelCases(architectureLabels: InstallerConfig["architectureLabels"]) {
  return TARGET_OPERATING_SYSTEMS.flatMap((os) =>
    CANONICAL_ARCHITECTURES.map(
      (arch) =>
        `    ${os}/${arch}) asset_arch_label=${shellLiteral(architectureLabels[os][arch])} ;;`,
    ),
  ).join("\n");
}
