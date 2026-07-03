import { describe, expect, test } from "bun:test";

import { dispatchCli } from "./dispatch";
import { CliExitCode } from "./exitCodes";
import { topLevelHelpText } from "./topLevelHelp";

describe("dispatchCli", () => {
  test("--help prints help text to stdout, nothing to stderr, and exits with the success code", () => {
    const result = dispatchCli(["--help"]);

    expect(result).toEqual({ stdout: topLevelHelpText, stderr: "", exitCode: CliExitCode.success });
  });

  test("-h prints help text to stdout, nothing to stderr, and exits with the success code", () => {
    const result = dispatchCli(["-h"]);

    expect(result).toEqual({ stdout: topLevelHelpText, stderr: "", exitCode: CliExitCode.success });
  });

  test("no arguments prints help text to stdout, nothing to stderr, and exits with the success code", () => {
    const result = dispatchCli([]);

    expect(result).toEqual({ stdout: topLevelHelpText, stderr: "", exitCode: CliExitCode.success });
  });

  test("an unrecognized command reports an error on stderr and exits with the unknown-command code", () => {
    const result = dispatchCli(["bogus-command"]);

    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("bogus-command");
    expect(result.exitCode).toBe(CliExitCode.unknownCommand);
  });

  test("an unrecognized option reports an error on stderr and exits with the unknown-option code", () => {
    const result = dispatchCli(["--nonsense"]);

    expect(result.stdout).toBe("");
    expect(result.stderr.length).toBeGreaterThan(0);
    expect(result.exitCode).toBe(CliExitCode.unknownOption);
  });
});
