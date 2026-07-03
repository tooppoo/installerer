import { CANONICAL_ARCHITECTURES } from "../../architectureLabels";
import type { InstallerConfig } from "../../installerConfig";
import type { RenderContext } from "../renderContext";
import { shellLiteral } from "../shell";

/**
 * Resolves the canonical architecture detected by `detect_target()` to the
 * configured `asset_arch_label`, embedded in Release asset names via
 * `{arch}`/`{target}`. This is a distinct stage from runtime canonicalization:
 * `canonical_arch` is fixed (`x86_64` | `aarch64`), while `asset_arch_label`
 * comes from `architectureLabels` and may be a preset or a custom value.
 */
export function renderArchitectureLabel({ config }: RenderContext): string {
  return `resolve_asset_arch_label() {
  canonical_arch=$1

  case "$canonical_arch" in
${architectureLabelCases(config.architectureLabels)}
    *) fail "unsupported architecture: $canonical_arch" ;;
  esac

  printf '%s\\n' "$asset_arch_label"
}

`;
}

function architectureLabelCases(architectureLabels: InstallerConfig["architectureLabels"]) {
  return CANONICAL_ARCHITECTURES.map(
    (arch) => `    ${arch}) asset_arch_label=${shellLiteral(architectureLabels[arch])} ;;`,
  ).join("\n");
}
