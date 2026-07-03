import { describe, expect, test } from "bun:test";

import {
  ARCHIVE_FORMAT_COMMAND_NAMES,
  ARCHIVE_FORMAT_DEPENDENCIES,
  BASE_COMMAND_DEPENDENCIES,
  CHECKSUM_DEPENDENCY,
  FILESYSTEM_PREMISES,
  NETWORK_PREMISES,
  SHELL_PREMISE,
} from "./definitions";

describe("runtime dependency definitions", () => {
  test("base command dependencies cover every command invoked unconditionally by the generated installer", () => {
    const ids = BASE_COMMAND_DEPENDENCIES.map((dependency) => dependency.id);
    expect(ids).toEqual([
      "uname",
      "mktemp",
      "rm",
      "mkdir",
      "cp",
      "mv",
      "chmod",
      "curl",
      "awk",
      "grep",
      "od",
      "tr",
      "cut",
      "ls",
    ]);
  });

  test("every base dependency is a single-command check", () => {
    for (const dependency of BASE_COMMAND_DEPENDENCIES) {
      expect(dependency.check.type).toBe("command");
    }
  });

  test("archive format command names match the archive-format dependencies", () => {
    expect(ARCHIVE_FORMAT_DEPENDENCIES["tar.gz"].check).toEqual({
      type: "command",
      command: ARCHIVE_FORMAT_COMMAND_NAMES["tar.gz"],
    });
    expect(ARCHIVE_FORMAT_DEPENDENCIES.zip.check).toEqual({
      type: "command",
      command: ARCHIVE_FORMAT_COMMAND_NAMES.zip,
    });
  });

  test("checksum dependency accepts either sha256sum or shasum", () => {
    expect(CHECKSUM_DEPENDENCY.check).toEqual({
      type: "any-command",
      commands: ["sha256sum", "shasum"],
    });
  });

  test("premises are tagged with the right category", () => {
    expect(SHELL_PREMISE.premise).toBe("shell");
    expect(NETWORK_PREMISES.every((premise) => premise.premise === "network")).toBe(true);
    expect(FILESYSTEM_PREMISES.every((premise) => premise.premise === "filesystem")).toBe(true);
  });
});
