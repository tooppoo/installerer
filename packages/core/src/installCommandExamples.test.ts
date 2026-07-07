import { describe, expect, test } from "bun:test";

import { buildInstallCommandExamples } from "./installCommandExamples";

describe("buildInstallCommandExamples", () => {
  const examples = buildInstallCommandExamples({ owner: "tooppoo", repo: "rellog" });

  test("generates the standard raw GitHub installer URL for main/install.sh", () => {
    expect(examples.rawInstallerUrl).toBe(
      "https://raw.githubusercontent.com/tooppoo/rellog/refs/heads/main/install.sh",
    );
  });

  test("generates the single standard curl | sh command", () => {
    expect(examples.standardCurlCommand).toBe(
      "curl -fsSL https://raw.githubusercontent.com/tooppoo/rellog/refs/heads/main/install.sh | sh",
    );
  });

  test("passes installer arguments via sh -s --", () => {
    expect(examples.pinnedVersionCurlCommand).toContain("| sh -s -- --version");
    expect(examples.installDirCurlCommand).toContain('| sh -s -- --install-dir "$HOME/bin"');
  });

  test("states the main/install.sh assumption behind the standard curl command", () => {
    expect(examples.standardCurlAssumption).toContain("/install.sh");
    expect(examples.standardCurlAssumption).toContain("main");
  });

  test("provides a review-first command sequence using curl -fsSLO", () => {
    expect(examples.reviewFirstCommands[0]).toContain("curl -fsSLO");
    expect(examples.reviewFirstCommands).toContain("sh ./install.sh --help");
    expect(examples.reviewFirstCommands).toContain("sh ./install.sh");
  });

  test("still provides local sh install.sh execution examples", () => {
    expect(examples.localCommands.valid).toContain("sh install.sh");
    expect(examples.localCommands.invalid).toEqual(["sh install.sh --version latest"]);
  });
});
