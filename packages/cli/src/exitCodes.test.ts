import { describe, expect, test } from "bun:test";

import { CliExitCode } from "./exitCodes";

describe("CliExitCode", () => {
  test("success is 0", () => {
    expect(CliExitCode.success).toBe(0);
  });

  test("configFileAlreadyExists is 3", () => {
    expect(CliExitCode.configFileAlreadyExists).toBe(3);
  });

  test("configFileWriteFailed is 4", () => {
    expect(CliExitCode.configFileWriteFailed).toBe(4);
  });

  test("configValidationFailed is 5", () => {
    expect(CliExitCode.configValidationFailed).toBe(5);
  });

  test("invalidConfigSyntax is 6", () => {
    expect(CliExitCode.invalidConfigSyntax).toBe(6);
  });

  test("configFileReadFailed is 7", () => {
    expect(CliExitCode.configFileReadFailed).toBe(7);
  });

  test("invalidValidateArguments is 8", () => {
    expect(CliExitCode.invalidValidateArguments).toBe(8);
  });

  test("every cause has a distinct value", () => {
    const values = Object.values(CliExitCode);

    expect(new Set(values).size).toBe(values.length);
  });
});
