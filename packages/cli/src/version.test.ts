import { describe, expect, test } from "bun:test";

import packageJson from "../../../package.json" with { type: "json" };
import { cliVersion } from "./version";

describe("cliVersion", () => {
  test("matches the repository root package.json's version", () => {
    expect(cliVersion).toBe(packageJson.version);
  });

  test("is not empty", () => {
    expect(cliVersion.length).toBeGreaterThan(0);
  });
});
