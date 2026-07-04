import type { RenderContext } from "../renderContext";
import { shellLiteral } from "../shell";
import { assertSafeCommandName } from "../../runtimeDependencies/resolve";
import { formatPremiseLine } from "../../runtimeDependencies/renderText";
import type {
  RuntimeDependencyCheck,
  RuntimeDependencyDefinition,
} from "../../runtimeDependencies/model";

/**
 * Builds the POSIX-sh boolean condition for a check strategy — shared with
 * `sections/dependencies.ts` so the pre-install gate and `--check-requirements`
 * dispatch on `RuntimeDependencyCheck` identically instead of each
 * re-implementing (and potentially missing) a check variant.
 */
export function renderCheckCondition(check: RuntimeDependencyCheck): string {
  switch (check.type) {
    case "command":
      assertSafeCommandName(check.command);
      return `command -v ${shellLiteral(check.command)} >/dev/null 2>&1`;
    case "any-command":
      check.commands.forEach(assertSafeCommandName);
      return check.commands
        .map((command) => `command -v ${shellLiteral(command)} >/dev/null 2>&1`)
        .join(" || ");
    case "all-commands":
      check.commands.forEach(assertSafeCommandName);
      return check.commands
        .map((command) => `command -v ${shellLiteral(command)} >/dev/null 2>&1`)
        .join(" && ");
  }
}

function renderDependencyCheck(dependency: RuntimeDependencyDefinition): string {
  const condition = renderCheckCondition(dependency.check);
  const label = shellLiteral(dependency.label);

  return `  if ${condition}; then
    printf 'ok: %s\\n' ${label}
  else
    printf 'missing: %s\\n' ${label}
    status=1
  fi`;
}

/**
 * `check_requirements()` probes every checkable dependency, never fails fast
 * (issue #75 policy: aggregate and report, then exit non-zero if anything is
 * missing), and lists non-checkable premises (network, filesystem) under a
 * trailing "Not checked:" section instead of probing them.
 */
export function renderCheckRequirements({ resolvedDependencies }: RenderContext): string {
  const shellPremises = resolvedDependencies.premises.filter(
    (premise) => premise.premise === "shell",
  );
  const notCheckedPremises = resolvedDependencies.premises.filter(
    (premise) => premise.premise !== "shell",
  );

  const premiseLines = shellPremises
    .map((premise) => `  printf '%s\\n' ${shellLiteral(formatPremiseLine(premise))}`)
    .join("\n");

  const checkLines = resolvedDependencies.dependencies.map(renderDependencyCheck).join("\n");

  const notCheckedLines = notCheckedPremises
    .map((premise) => `  printf '%s\\n' ${shellLiteral(formatPremiseLine(premise))}`)
    .join("\n");

  return `check_requirements() {
  status=0
  printf '%s\\n' "Checking runtime requirements..."
  printf '\\n'
  printf '%s\\n' "Runtime premise:"
${premiseLines}
  printf '\\n'
${checkLines}
  printf '\\n'
  printf '%s\\n' "Not checked:"
${notCheckedLines}
  printf '\\n'
  if [ "$status" -eq 0 ]; then
    printf '%s\\n' "All checkable requirements are satisfied."
  else
    printf '%s\\n' "Some checkable requirements are missing."
  fi
  return "$status"
}

`;
}
