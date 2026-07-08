import type { ArchiveTemplateWarning } from "./archiveTemplate";
import type { KdlSourceLocation, KdlSyntaxError } from "./kdl/parseKdlText";
import type { ValidationError } from "./validation";

/**
 * Config diagnostics model shared by the `validate` and `generate` CLI commands (#107, building on #99/#106).
 *
 * A diagnostic describes one problem found while turning KDL config text into an `InstallerConfig`:
 *
 * - `syntax`: the KDL text could not be parsed (from `parseKdlText`)
 * - `codec`: the KDL AST could not be decoded into `InstallerConfig` (#108)
 * - `semantic`: the decoded config violates a validation rule
 *
 * Command errors (file IO failures, invalid CLI arguments) are NOT config diagnostics; commands must report those separately.
 */
export type ConfigDiagnosticPhase = "syntax" | "codec" | "semantic";

export type ConfigDiagnosticSeverity = "error" | "warning";

export type ConfigDiagnostic = {
  severity: ConfigDiagnosticSeverity;
  phase: ConfigDiagnosticPhase;
  /**
   * KDL-facing path (e.g. `installerer.binary.path-in-archive`), preferred whenever one can be derived.
   * Semantic diagnostics that cannot be mapped back to a KDL-facing path may carry a domain path (e.g. `$.owner`) instead: semantic rules run on the decoded `InstallerConfig`, where the KDL AST is no longer available, and reverse-mapping belongs to the codec layer (#108).
   * Syntax diagnostics have no AST at all and usually carry only a `location`.
   */
  path?: string;
  /** Source position from the KDL parser, when it reported one. */
  location?: KdlSourceLocation;
  reason: string;
  /** What the value should have been; omitted when there is no expectation to state. */
  expected?: string;
  /** A non-mandatory suggestion for a warning-severity diagnostic; omitted for errors, which use `expected` instead. */
  recommended?: string;
};

export function configDiagnosticFromKdlSyntaxError(error: KdlSyntaxError): ConfigDiagnostic {
  return {
    severity: "error",
    phase: "syntax",
    location: error.location,
    reason: toSingleLineReason(error.message),
  };
}

/**
 * `kdljs`'s underlying chevrotain parser reports some syntax failures (e.g. an unterminated string) via a multi-line "one of these possible Token sequences" message, spanning dozens of lines and containing blank lines of its own.
 * Collapsing it to one line keeps every `reason:` on a single line and keeps blank lines a reliable diagnostic separator, per the formatter's output contract.
 */
function toSingleLineReason(message: string): string {
  return message.replace(/\s+/g, " ").trim();
}

/**
 * Wraps a validator-side `ValidationError` as a config diagnostic.
 *
 * `ValidationError` stays the accumulation type inside validators; this boundary adds the severity/phase that validators don't know about.
 * The `path` is passed through unchanged, so codec callers are expected to translate paths to KDL-facing form before (or instead of) using this helper (#108).
 */
export function configDiagnosticFromValidationError(
  error: ValidationError,
  options: { phase: "codec" | "semantic"; severity?: ConfigDiagnosticSeverity },
): ConfigDiagnostic {
  return {
    severity: options.severity ?? "error",
    phase: options.phase,
    path: error.path,
    reason: error.reason,
    ...(error.expected !== undefined ? { expected: error.expected } : {}),
  };
}

/**
 * Wraps an `ArchiveTemplateWarning` (`path` / `reason` / `recommended`) as a warning-severity `semantic` config diagnostic.
 *
 * Like `configDiagnosticFromValidationError`, this passes `path` through unchanged: `ArchiveTemplateWarning`s come from `validateInstallerConfig`, which only knows domain paths (e.g. `$.archive.nameTemplate`), so callers that have a KDL AST are expected to translate to a KDL-facing path before (or instead of) using this helper, the same boundary split #108 established for errors.
 */
export function configDiagnosticFromArchiveTemplateWarning(
  warning: ArchiveTemplateWarning,
): ConfigDiagnostic {
  return {
    severity: "warning",
    phase: "semantic",
    path: warning.path,
    reason: warning.reason,
    recommended: warning.recommended,
  };
}

/**
 * Formats config diagnostics for CLI stderr.
 *
 * Pure string formatter: writing to stderr is the command layer's job, and this function must stay free of `process`/`console`/Node-specific APIs so it fits the runtime-neutral `packages/core` boundary.
 * No ANSI color or terminal-width wrapping in v0.
 *
 * Output contract (pinned by snapshot tests):
 * - diagnostics are emitted in input order
 * - each block is `severity[phase] <path | line:column | nothing>` followed by an indented `reason:` line and, only when present, an `expected:` line and/or a `recommended:` line
 * - blocks are separated by one blank line
 * - LF newlines, exactly one final newline
 * - an empty input formats to an empty string (the command writes nothing)
 */
export function formatConfigDiagnostics(diagnostics: readonly ConfigDiagnostic[]): string {
  if (diagnostics.length === 0) {
    return "";
  }

  return `${diagnostics.map(formatConfigDiagnostic).join("\n\n")}\n`;
}

function formatConfigDiagnostic(diagnostic: ConfigDiagnostic): string {
  const lines = [
    `${diagnostic.severity}[${diagnostic.phase}]${formatSubject(diagnostic)}`,
    `  reason: ${diagnostic.reason}`,
  ];

  if (diagnostic.expected !== undefined) {
    lines.push(`  expected: ${diagnostic.expected}`);
  }

  if (diagnostic.recommended !== undefined) {
    lines.push(`  recommended: ${diagnostic.recommended}`);
  }

  return lines.join("\n");
}

function formatSubject(diagnostic: ConfigDiagnostic): string {
  if (diagnostic.path !== undefined) {
    return ` ${diagnostic.path}`;
  }

  if (diagnostic.location !== undefined) {
    return ` ${diagnostic.location.line}:${diagnostic.location.column}`;
  }

  return "";
}
