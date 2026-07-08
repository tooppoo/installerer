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

  test("every cause has a distinct value", () => {
    const values = Object.values(CliExitCode);

    expect(new Set(values).size).toBe(values.length);
  });
});
