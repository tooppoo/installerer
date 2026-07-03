import { describe, expect, test } from "bun:test";

import { CliExitCode } from "../exitCodes";
import { topLevelHelpText } from "../topLevelHelp";
import { processNodeCliIO, runNodeCli } from "./runNodeCli";

function fakeIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCodes: number[] = [];
  return {
    stdout,
    stderr,
    exitCodes,
    io: {
      writeStdout: (text: string) => stdout.push(text),
      writeStderr: (text: string) => stderr.push(text),
      exit: (code: number) => exitCodes.push(code),
    },
  };
}

describe("runNodeCli", () => {
  test("writes dispatchCli's stdout and exits with its exit code on --help", () => {
    const { stdout, stderr, exitCodes, io } = fakeIo();

    runNodeCli(["--help"], io);

    expect(stdout).toEqual([topLevelHelpText]);
    expect(stderr).toEqual([""]);
    expect(exitCodes).toEqual([CliExitCode.success]);
  });

  test("writes dispatchCli's stderr and exits with its exit code on an unknown command", () => {
    const { stdout, stderr, exitCodes, io } = fakeIo();

    runNodeCli(["bogus-command"], io);

    expect(stdout).toEqual([""]);
    expect(stderr).toHaveLength(1);
    expect(stderr[0]).toContain("bogus-command");
    expect(exitCodes).toEqual([CliExitCode.unknownCommand]);
  });
});

describe("processNodeCliIO", () => {
  test("writeStdout/writeStderr are no-ops for empty strings", () => {
    expect(() => processNodeCliIO.writeStdout("")).not.toThrow();
    expect(() => processNodeCliIO.writeStderr("")).not.toThrow();
  });

  test("exit calls process.exit with the given code", () => {
    const originalExit = process.exit;
    let receivedCode: number | undefined;
    process.exit = ((code?: number) => {
      receivedCode = code;
    }) as typeof process.exit;

    try {
      processNodeCliIO.exit(0);
    } finally {
      process.exit = originalExit;
    }

    expect(receivedCode).toBe(0);
  });
});
