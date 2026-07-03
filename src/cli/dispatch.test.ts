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

  test("leaves the no-argument case undefined for the dispatch skeleton to define", () => {
    const result = dispatchCli([]);

    expect(result).toBeUndefined();
  });

  test("leaves unrecognized commands undefined for their own issues to define", () => {
    const result = dispatchCli(["generate"]);

    expect(result).toBeUndefined();
  });
});
