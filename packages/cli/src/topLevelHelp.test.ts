import { describe, expect, test } from "bun:test";

import { topLevelHelpFrame, topLevelHelpText } from "./topLevelHelp";

describe("topLevelHelpText", () => {
  test("matches the committed help text snapshot", () => {
    expect(topLevelHelpText).toBe(
      [
        "installerer generates a self-contained install.sh from a JSON config.",
        "",
        "Usage:",
        "  installerer <command> [options]",
        "",
        "Commands:",
        "  installerer init",
        "  installerer validate --config installerer.json",
        "  installerer generate --config installerer.json --out install.sh",
        "  installerer doctor --config installerer.json",
        "  installerer --version",
        "  installerer --help",
        "",
        "Options:",
        "  -h, --help",
        "  -v, --version",
        "",
      ].join("\n"),
    );
  });

  test("lists only generator-only commands, not package-installer-like commands", () => {
    const commands = topLevelHelpFrame.commands ?? [];
    const forbidden = [
      "installerer install",
      "installerer run",
      "installerer exec",
      "installerer upgrade",
      "installerer uninstall",
    ];

    for (const command of forbidden) {
      expect(commands).not.toContain(command);
    }
  });

  test("lists -h, --help and -v, --version in options", () => {
    expect(topLevelHelpFrame.options).toContain("-h, --help");
    expect(topLevelHelpFrame.options).toContain("-v, --version");
  });
});
