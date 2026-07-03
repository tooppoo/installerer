import { describe, expect, test } from "bun:test";

import { dispatchCli } from "./dispatch";
import { topLevelHelpText } from "./topLevelHelp";

describe("dispatchCli", () => {
  test("--help prints help text to stdout, nothing to stderr, and exits 0", () => {
    const result = dispatchCli(["--help"]);

    expect(result).toEqual({ stdout: topLevelHelpText, stderr: "", exitCode: 0 });
  });

  test("-h prints help text to stdout, nothing to stderr, and exits 0", () => {
    const result = dispatchCli(["-h"]);

    expect(result).toEqual({ stdout: topLevelHelpText, stderr: "", exitCode: 0 });
  });

  test("no arguments prints help text to stdout, nothing to stderr, and exits 0", () => {
    const result = dispatchCli([]);

    expect(result).toEqual({ stdout: topLevelHelpText, stderr: "", exitCode: 0 });
  });

  test("an unrecognized command reports an error on stderr and exits non-zero", () => {
    const result = dispatchCli(["bogus-command"]);

    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("bogus-command");
    expect(result.exitCode).not.toBe(0);
  });

  test("an unrecognized option reports an error on stderr and exits non-zero", () => {
    const result = dispatchCli(["--nonsense"]);

    expect(result.stdout).toBe("");
    expect(result.stderr.length).toBeGreaterThan(0);
    expect(result.exitCode).not.toBe(0);
  });
});
