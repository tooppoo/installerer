import { describe, expect, test } from "bun:test";

import {
  configDiagnosticFromArchiveTemplateWarning,
  configDiagnosticFromKdlSyntaxError,
  configDiagnosticFromValidationError,
  formatConfigDiagnostics,
  type ConfigDiagnostic,
} from "./configDiagnostics";
import { parseKdlText } from "./kdl/parseKdlText";

const codecError: ConfigDiagnostic = {
  severity: "error",
  phase: "codec",
  path: "installerer.binary.path-in-archive",
  reason: "Required property is missing.",
  expected: "string",
};

const semanticWarning: ConfigDiagnostic = {
  severity: "warning",
  phase: "semantic",
  path: "installerer.archive.name-template",
  reason: "Archive name template does not include {version}.",
};

const syntaxErrorWithLocation: ConfigDiagnostic = {
  severity: "error",
  phase: "syntax",
  location: { line: 3, column: 18, offset: 42 },
  reason: "KDL syntax parse failed.",
};

const syntaxErrorWithoutLocation: ConfigDiagnostic = {
  severity: "error",
  phase: "syntax",
  reason: "KDL syntax parse failed unexpectedly.",
};

describe("formatConfigDiagnostics", () => {
  test("formats the #107 example: codec error with path and expected, semantic warning without expected", () => {
    expect(formatConfigDiagnostics([codecError, semanticWarning])).toMatchSnapshot();
  });

  test("formats a syntax error without path as line:column", () => {
    expect(formatConfigDiagnostics([syntaxErrorWithLocation])).toMatchSnapshot();
  });

  test("formats a syntax error with neither path nor location as phase only", () => {
    expect(formatConfigDiagnostics([syntaxErrorWithoutLocation])).toMatchSnapshot();
  });

  test("formats a mixed batch, pinning the separator between diagnostics", () => {
    expect(
      formatConfigDiagnostics([
        syntaxErrorWithLocation,
        codecError,
        semanticWarning,
        syntaxErrorWithoutLocation,
      ]),
    ).toMatchSnapshot();
  });

  test("prefers path over location when a diagnostic carries both", () => {
    expect(
      formatConfigDiagnostics([
        {
          ...codecError,
          location: { line: 7, column: 3, offset: 120 },
        },
      ]),
    ).toMatchSnapshot();
  });

  test("preserves input order instead of sorting by severity or phase", () => {
    const output = formatConfigDiagnostics([semanticWarning, codecError]);

    expect(output.indexOf("warning[semantic]")).toBeLessThan(output.indexOf("error[codec]"));
  });

  test("ends with exactly one final newline and uses LF only", () => {
    const output = formatConfigDiagnostics([codecError, semanticWarning]);

    expect(output.endsWith("\n")).toBe(true);
    expect(output.endsWith("\n\n")).toBe(false);
    expect(output).not.toInclude("\r");
  });

  test("omits the expected line when a diagnostic has no expected", () => {
    expect(formatConfigDiagnostics([semanticWarning])).not.toInclude("expected:");
  });

  test("formats zero diagnostics as an empty string, so the command writes nothing", () => {
    expect(formatConfigDiagnostics([])).toBe("");
  });

  test("formats a warning's recommended line alongside its reason", () => {
    const recommendedWarning: ConfigDiagnostic = {
      severity: "warning",
      phase: "semantic",
      path: "installerer.archive.name-template",
      reason: "Archive filename contains a character some shells treat specially.",
      recommended:
        "Use only ASCII letters, digits, '.', '_', and '-' in the archive name template.",
    };

    expect(formatConfigDiagnostics([recommendedWarning])).toMatchSnapshot();
  });
});

describe("configDiagnosticFromKdlSyntaxError", () => {
  test("converts a real parseKdlText failure into a syntax error diagnostic with its source location", () => {
    const result = parseKdlText(`node "unterminated`);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");

    const diagnostic = configDiagnosticFromKdlSyntaxError(result.errors[0]!);

    expect(diagnostic.severity).toBe("error");
    expect(diagnostic.phase).toBe("syntax");
    expect(diagnostic.path).toBeUndefined();
    expect(diagnostic.location).toEqual({ line: 1, column: 6, offset: 5 });
    expect(diagnostic.reason).toBeString();
  });

  test("keeps location undefined when the parser reported none", () => {
    const result = parseKdlText(`installerer {`);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");

    const diagnostic = configDiagnosticFromKdlSyntaxError(result.errors[0]!);

    expect(diagnostic.location).toBeUndefined();
  });

  test("collapses kdljs's multi-line chevrotain message so the formatted reason stays on one line", () => {
    const result = parseKdlText(`node "unterminated`);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");

    // kdljs's underlying chevrotain parser reports this failure via a
    // multi-line "one of these possible Token sequences" message; guard
    // that real-world case rather than only a hand-built object literal.
    expect(result.errors[0]!.message).toInclude("\n");

    const diagnostic = configDiagnosticFromKdlSyntaxError(result.errors[0]!);
    const formatted = formatConfigDiagnostics([diagnostic]);
    const reasonLines = formatted.split("\n").filter((line) => line.startsWith("  reason:"));

    expect(diagnostic.reason).not.toInclude("\n");
    expect(reasonLines).toHaveLength(1);
  });
});

describe("configDiagnosticFromValidationError", () => {
  test("wraps a ValidationError as an error diagnostic of the given phase, passing the path through unchanged", () => {
    const diagnostic = configDiagnosticFromValidationError(
      { path: "$.owner", reason: "Required field is missing.", expected: "string" },
      { phase: "semantic" },
    );

    expect(diagnostic).toEqual({
      severity: "error",
      phase: "semantic",
      path: "$.owner",
      reason: "Required field is missing.",
      expected: "string",
    });
  });

  test("allows overriding severity for warning-level rules and omits expected when absent", () => {
    const diagnostic = configDiagnosticFromValidationError(
      { path: "$.archive.nameTemplate", reason: "Template does not include {version}." },
      { phase: "semantic", severity: "warning" },
    );

    expect(diagnostic.severity).toBe("warning");
    expect("expected" in diagnostic).toBe(false);
  });
});

describe("configDiagnosticFromArchiveTemplateWarning", () => {
  test("wraps an ArchiveTemplateWarning as a warning-severity semantic diagnostic, passing the path through unchanged", () => {
    const diagnostic = configDiagnosticFromArchiveTemplateWarning({
      path: "$.archive.nameTemplate",
      reason: "Archive filename contains a character some shells treat specially.",
      recommended: "Use only ASCII letters, digits, '.', '_', and '-'.",
    });

    expect(diagnostic).toEqual({
      severity: "warning",
      phase: "semantic",
      path: "$.archive.nameTemplate",
      reason: "Archive filename contains a character some shells treat specially.",
      recommended: "Use only ASCII letters, digits, '.', '_', and '-'.",
    });
  });
});
