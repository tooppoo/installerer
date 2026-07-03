import type { ResolvedRuntimeDependencies } from "./model";

/**
 * JSON shape for reuse by the CLI and by snapshot tests. This shape is
 * internal-use only for now — not an external compatibility contract (issue
 * #75 non-goal) — so it may change without a deprecation cycle.
 */
export type RuntimeRequirementsJson = ResolvedRuntimeDependencies;

export function renderRuntimeRequirementsJson(
  resolved: ResolvedRuntimeDependencies,
): RuntimeRequirementsJson {
  return {
    dependencies: resolved.dependencies,
    premises: resolved.premises,
  };
}
