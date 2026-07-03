import type { RenderContext } from "../renderContext";
import { shellLiteral } from "../shell";
import { renderRuntimeRequirementsText } from "../../runtimeDependencies/renderText";

/**
 * `print_requirements()` just prints the resolved runtime requirements text
 * (the same text the Web UI and CLI-reusable renderer show for this config)
 * as static `printf` lines. No runtime logic is needed: the dependency list
 * is fully resolved at generation time from `resolvedDependencies`.
 */
export function renderPrintRequirements({ resolvedDependencies }: RenderContext): string {
  const lines = renderRuntimeRequirementsText(resolvedDependencies).replace(/\n$/, "").split("\n");
  const body = lines.map((line) => `  printf '%s\\n' ${shellLiteral(line)}`).join("\n");

  return `print_requirements() {
${body}
}

`;
}
