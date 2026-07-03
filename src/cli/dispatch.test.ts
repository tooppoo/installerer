import { describe, expect, test } from "bun:test";

import { dispatchCli } from "./dispatch";
import { CliExitCode } from "./exitCodes";
import { topLevelHelpText } from "./topLevelHelp";
import { cliVersion } from "./version";

describe("dispatchCli", () => {
  test("--help prints help text to stdout, nothing to stderr, and exits with the success code", () => {
    const result = dispatchCli(["--help"]);

    expect(result).toEqual({ stdout: topLevelHelpText, stderr: "", exitCode: CliExitCode.success });
  });

  test("-h prints help text to stdout, nothing to stderr, and exits with the success code", () => {
    const result = dispatchCli(["-h"]);

    expect(result).toEqual({ stdout: topLevelHelpText, stderr: "", exitCode: CliExitCode.success });
  });

  test("--version prints the version to stdout, nothing to stderr, and exits with the success code", () => {
    const result = dispatchCli(["--version"]);

    expect(result).toEqual({
      stdout: `${cliVersion}\n`,
      stderr: "",
      exitCode: CliExitCode.success,
    });
  });

  test("-v prints the version to stdout, nothing to stderr, and exits with the success code", () => {
    const result = dispatchCli(["-v"]);

    expect(result).toEqual({
      stdout: `${cliVersion}\n`,
      stderr: "",
      exitCode: CliExitCode.success,
    });
  });

  test("--version output is the version string only, with no program name", () => {
    const result = dispatchCli(["--version"]);

    expect(result.stdout).toBe(`${cliVersion}\n`);
    expect(result.stdout).not.toContain("installerer");
  });

  test("--version output ends with exactly one trailing newline", () => {
    const result = dispatchCli(["--version"]);

    expect(result.stdout.endsWith("\n")).toBe(true);
    expect(result.stdout.endsWith("\n\n")).toBe(false);
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
