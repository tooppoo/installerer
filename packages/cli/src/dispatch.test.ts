import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONFIG_FILE_NAME, INIT_CONFIG_TEMPLATE } from "./commands/init";
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

  test("a positional followed by --version still reports the positional as an unknown command", () => {
    const result = dispatchCli(["bogus-command", "--version"]);

    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("bogus-command");
    expect(result.exitCode).toBe(CliExitCode.unknownCommand);
  });

  test("a positional followed by -v still reports the positional as an unknown command", () => {
    const result = dispatchCli(["generate", "-v"]);

    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("generate");
    expect(result.exitCode).toBe(CliExitCode.unknownCommand);
  });

  test("a positional followed by --help still reports the positional as an unknown command", () => {
    const result = dispatchCli(["generate", "--help"]);

    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("generate");
    expect(result.exitCode).toBe(CliExitCode.unknownCommand);
  });

  test("init routes to the init command module and writes installerer.kdl under the given cwd", () => {
    const dir = mkdtempSync(join(tmpdir(), "installerer-dispatch-init-test-"));

    try {
      const result = dispatchCli(["init"], dir);

      expect(result).toEqual({
        stdout: `created ${CONFIG_FILE_NAME}\n`,
        stderr: "",
        exitCode: CliExitCode.success,
      });
      expect(readFileSync(join(dir, CONFIG_FILE_NAME), "utf8")).toBe(INIT_CONFIG_TEMPLATE);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("init with an unrecognized option reports an error on stderr and exits with the unknown-option code", () => {
    const dir = mkdtempSync(join(tmpdir(), "installerer-dispatch-init-test-"));

    try {
      const result = dispatchCli(["init", "--force"], dir);

      expect(result.stdout).toBe("");
      expect(result.stderr.length).toBeGreaterThan(0);
      expect(result.exitCode).toBe(CliExitCode.unknownOption);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("init --help prints help text instead of running init, and does not create installerer.kdl", () => {
    const dir = mkdtempSync(join(tmpdir(), "installerer-dispatch-init-test-"));

    try {
      const result = dispatchCli(["init", "--help"], dir);

      expect(result).toEqual({
        stdout: topLevelHelpText,
        stderr: "",
        exitCode: CliExitCode.success,
      });
      expect(existsSync(join(dir, CONFIG_FILE_NAME))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("init -v prints the version instead of running init, and does not create installerer.kdl", () => {
    const dir = mkdtempSync(join(tmpdir(), "installerer-dispatch-init-test-"));

    try {
      const result = dispatchCli(["init", "-v"], dir);

      expect(result).toEqual({
        stdout: `${cliVersion}\n`,
        stderr: "",
        exitCode: CliExitCode.success,
      });
      expect(existsSync(join(dir, CONFIG_FILE_NAME))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("validate routes to the validate command module and reads the config from the given cwd", () => {
    const dir = mkdtempSync(join(tmpdir(), "installerer-dispatch-validate-test-"));

    try {
      writeFileSync(join(dir, CONFIG_FILE_NAME), INIT_CONFIG_TEMPLATE);

      const result = dispatchCli(["validate", "--config", CONFIG_FILE_NAME], dir);

      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(CliExitCode.success);
      expect(result.stdout).toContain("is valid");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("validate --help prints help text instead of running validate", () => {
    const result = dispatchCli(["validate", "--help"], "/irrelevant");

    expect(result).toEqual({ stdout: topLevelHelpText, stderr: "", exitCode: CliExitCode.success });
  });

  test("validate -v prints the version instead of running validate", () => {
    const result = dispatchCli(["validate", "-v"], "/irrelevant");

    expect(result).toEqual({
      stdout: `${cliVersion}\n`,
      stderr: "",
      exitCode: CliExitCode.success,
    });
  });

  test("validate with no arguments reports validate's own invalid-arguments error, not the top-level unknown-option code", () => {
    const result = dispatchCli(["validate"], "/irrelevant");

    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("missing required option");
    expect(result.exitCode).toBe(CliExitCode.invalidValidateArguments);
  });

  test("validate with an option it doesn't support reports validate's own invalid-arguments error, not the top-level unknown-option code", () => {
    const result = dispatchCli(
      ["validate", "--config", "installerer.kdl", "--bogus"],
      "/irrelevant",
    );

    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(CliExitCode.invalidValidateArguments);
  });
});
