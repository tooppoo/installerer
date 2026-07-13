import type { TargetArch } from "./installerConfig";
import type { ValidationError } from "./validation";

/**
 * Canonical CPU architectures the generator core knows about at runtime.
 * These are the values `detect_target()` resolves `uname -m` output to; they
 * are distinct from `asset_arch_label`, the value embedded in Release asset
 * names (see docs/guide/generated-installer-runtime.md).
 */
export const CANONICAL_ARCHITECTURES: readonly TargetArch[] = ["x86_64", "aarch64"];

/**
 * Representative asset-name label spellings offered as UI presets per
 * canonical architecture. Any other value must be entered as a custom label.
 */
export const ARCHITECTURE_LABEL_PRESETS: Record<TargetArch, readonly string[]> = {
  x86_64: ["amd64", "x86_64"],
  aarch64: ["arm64", "aarch64"],
};

/**
 * Default `canonical_arch -> asset_arch_label` mapping applied when omitted
 * from config: the OS-reported architecture name, not a build-tool-specific
 * convention (e.g. Go's GOARCH `amd64`/`arm64`). Projects that publish assets
 * using that convention instead set `architectureLabels` explicitly.
 */
export const DEFAULT_ARCHITECTURE_LABELS: Record<TargetArch, string> = {
  x86_64: "x86_64",
  aarch64: "aarch64",
};

/**
 * `asset_arch_label` values must be safe to embed in a Release asset filename
 * and in the generated shell script's `case` statement. `.` and `..` match
 * this character class but are rejected explicitly below.
 */
export const ASSET_ARCH_LABEL_PATTERN = /^[A-Za-z0-9._+-]+$/;

export function validateAssetArchLabel(value: string, path: string, errors: ValidationError[]) {
  if (
    value.length === 0 ||
    value === "." ||
    value === ".." ||
    !ASSET_ARCH_LABEL_PATTERN.test(value)
  ) {
    errors.push({
      path,
      reason: "Value is not a safe architecture label.",
      expected: "non-empty A-Z a-z 0-9 . _ + -, not '.' or '..'",
    });
  }
}
