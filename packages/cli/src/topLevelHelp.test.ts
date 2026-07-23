import { describe, expect, test } from "bun:test";

import { topLevelHelpFrame, topLevelHelpText } from "./topLevelHelp";

describe("topLevelHelpText", () => {
  test("matches the committed help text snapshot", () => {
    expect(topLevelHelpText).toBe(
      [
        "installerer generates a self-contained install.sh from a KDL config.",
        "",
        "Usage:",
        "  installerer <command> [options]",
        "",
        "Commands:",
        "  installerer init",
        "  installerer validate --config installerer.kdl",
        "  installerer generate --config installerer.kdl --out install.sh",
        "  installerer doctor --config installerer.kdl",
        "  installerer --version",
        "  installerer --help",
        "",
        "Options:",
        "  -h, --help",
        "  -v, --version",
        "",
        "Examples:",
        "  curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/install.sh | sh",
        "  Assumes install.sh is committed at /install.sh on the main branch.",
        "  curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/install.sh | sh -s -- --version v0.1.2",
        '  curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/install.sh | sh -s -- --install-dir "$HOME/bin"',
        "  curl -fsSLO https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/install.sh",
        "  sh ./install.sh --help",
        "  sh ./install.sh",
        "",
      ].join("\n"),
    );
  });

  describe("lists only generator-only commands, not package-installer-like commands", () => {
    const commands = topLevelHelpFrame.commands ?? [];

    test.each([
      "installerer install",
      "installerer run",
      "installerer exec",
      "installerer upgrade",
      "installerer uninstall",
    ])("does not list the package-installer-like command %p", (command) => {
      expect(commands).not.toContain(command);
    });
  });

  test("lists -h, --help and -v, --version in options", () => {
    expect(topLevelHelpFrame.options).toContain("-h, --help");
    expect(topLevelHelpFrame.options).toContain("-v, --version");
  });

  test("shows a standard curl install example built from the shared core helper", () => {
    const examples = topLevelHelpFrame.examples ?? [];

    expect(examples).toContain(
      "curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/install.sh | sh",
    );
  });

  test("passes installer arguments via sh -s -- in the curl examples", () => {
    const text = topLevelHelpText;

    expect(text).toContain("| sh -s -- --version");
    expect(text).toContain('| sh -s -- --install-dir "$HOME/bin"');
  });

  test("includes the review-first alternative commands", () => {
    const text = topLevelHelpText;

    expect(text).toContain("curl -fsSLO");
    expect(text).toContain("sh ./install.sh --help");
    expect(text).toContain("sh ./install.sh");
  });

  test.each([...(topLevelHelpFrame.examples ?? [])])(
    "uses a placeholder owner/repo since no config is loaded at the top level: %p",
    (example) => {
      expect(example).not.toMatch(/raw\.githubusercontent\.com\/(?!<owner>\/<repo>)/);
    },
  );
});
