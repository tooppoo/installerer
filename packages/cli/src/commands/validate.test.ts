import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CliExitCode } from "../exitCodes";
import { validateCommand } from "./validate";

const VALID_KDL = `installerer {
  source owner="tooppoo" repo="git-kura"

  binary name="git-kura" path-in-archive="git-kura"

  archive format="tar.gz" name-template="{repo}_{version}_{os}_{arch}.tar.gz" os-case="lowercase"

  checksum file-name="checksums.txt" algorithm="sha256"

  targets {
    target os="linux" arch="x86_64"
    target os="linux" arch="aarch64"
    target os="darwin" arch="x86_64"
    target os="darwin" arch="aarch64"
  }

  architecture-labels x86_64="x86_64" aarch64="aarch64"

  defaults install-dir="$HOME/.local/bin"
}
`;

const KDL_WITH_WARNING = `installerer {
  source owner="tooppoo" repo="git-kura"

  binary name="git-kura" path-in-archive="git-kura"

  archive format="tar.gz" name-template="-{repo}_{version}_{os}_{arch}.tar.gz"

  checksum file-name="checksums.txt" algorithm="sha256"

  targets {
    target os="linux" arch="x86_64"
  }
}
`;

const SEMANTICALLY_INVALID_KDL = `installerer {
  source owner="-bad-owner" repo="git-kura"

  binary name="git-kura" path-in-archive="git-kura"

  archive format="tar.gz" name-template="{repo}_{version}_{os}_{arch}.tar.gz"

  checksum file-name="checksums.txt" algorithm="sha256"

  targets {
    target os="linux" arch="x86_64"
  }
}
`;

const CODEC_INVALID_KDL = `installerer {
  source owner="tooppoo" repo="git-kura"

  binary name="git-kura" path-in-archive="git-kura"

  archive format="tar.gz" name-template="{repo}_{version}_{os}_{arch}.tar.gz"

  targets {
    target os="linux" arch="x86_64"
  }
}
`;

const SYNTACTICALLY_INVALID_KDL = `installerer {\n  source owner="unterminated\n`;

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "installerer-validate-test-"));
  try {
    return fn(dir);
  } finally {
    chmodSync(dir, 0o700);
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeConfig(dir: string, name: string, content: string): string {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

describe("validateCommand.run", () => {
  test("a valid config prints a success summary to stdout, writes nothing to stderr, and exits 0", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", VALID_KDL);

      const result = validateCommand.run(["--config", "installerer.kdl"], dir);

      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(CliExitCode.success);
      expect(result.stdout).toContain("installerer.kdl is valid");
      expect(result.stdout).toContain("tooppoo/git-kura");
    });
  });

  test("accepts an absolute --config path", () => {
    withTempDir((dir) => {
      const path = writeConfig(dir, "installerer.kdl", VALID_KDL);

      const result = validateCommand.run(["--config", path], dir);

      expect(result.exitCode).toBe(CliExitCode.success);
    });
  });

  test("a valid config with warnings stays exit 0, prints warnings to stderr, and keeps stdout to the success summary", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", KDL_WITH_WARNING);

      const result = validateCommand.run(["--config", "installerer.kdl"], dir);

      expect(result.exitCode).toBe(CliExitCode.success);
      expect(result.stdout).toContain("is valid");
      expect(result.stdout).not.toContain("warning[");
      expect(result.stderr).toContain("warning[semantic]");
      expect(result.stderr).toContain("installerer.archive.name-template");
      expect(result.stderr).toContain("recommended:");
    });
  });

  test("a semantically invalid config reports diagnostics on stderr and exits with the config-validation-failed code", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", SEMANTICALLY_INVALID_KDL);

      const result = validateCommand.run(["--config", "installerer.kdl"], dir);

      expect(result.stdout).toBe("");
      expect(result.exitCode).toBe(CliExitCode.configValidationFailed);
      expect(result.stderr).toContain("error[semantic]");
      expect(result.stderr).toContain("installerer.source.owner");
    });
  });

  test("a config with a codec-shape error reports diagnostics on stderr and exits with the config-validation-failed code", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", CODEC_INVALID_KDL);

      const result = validateCommand.run(["--config", "installerer.kdl"], dir);

      expect(result.stdout).toBe("");
      expect(result.exitCode).toBe(CliExitCode.configValidationFailed);
      expect(result.stderr).toContain("error[codec]");
      expect(result.stderr).toContain("installerer.checksum");
    });
  });

  test("invalid KDL syntax reports a root-level diagnostic on stderr and exits with the invalid-config-syntax code", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", SYNTACTICALLY_INVALID_KDL);

      const result = validateCommand.run(["--config", "installerer.kdl"], dir);

      expect(result.stdout).toBe("");
      expect(result.exitCode).toBe(CliExitCode.invalidConfigSyntax);
      expect(result.stderr).toContain("error[syntax]");
    });
  });

  test("a missing config file reports a command error on stderr and exits with the config-file-read-failed code", () => {
    withTempDir((dir) => {
      const result = validateCommand.run(["--config", "does-not-exist.kdl"], dir);

      expect(result.stdout).toBe("");
      expect(result.exitCode).toBe(CliExitCode.configFileReadFailed);
      expect(result.stderr).toContain("does-not-exist.kdl");
      expect(result.stderr).toContain("installerer init");
    });
  });

  // Relies on the OS enforcing file permissions against the test-runner's
  // own UID; a root process bypasses permission bits entirely, so this
  // would spuriously fail (read would succeed) under a root-by-default
  // container.
  test.skipIf(process.getuid?.() === 0)(
    "an unreadable config file reports the system error on stderr and exits with the config-file-read-failed code",
    () => {
      withTempDir((dir) => {
        const path = writeConfig(dir, "installerer.kdl", VALID_KDL);
        chmodSync(path, 0o000);

        const result = validateCommand.run(["--config", "installerer.kdl"], dir);

        expect(result.stdout).toBe("");
        expect(result.exitCode).toBe(CliExitCode.configFileReadFailed);
        expect(result.stderr).toContain("failed to read installerer.kdl");
      });
    },
  );

  test("missing --config reports a command error and usage on stderr and exits with the invalid-validate-arguments code", () => {
    const result = validateCommand.run([], "/irrelevant");

    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(CliExitCode.invalidValidateArguments);
    expect(result.stderr).toContain("missing required option");
    expect(result.stderr).toContain("usage: installerer validate --config <path>");
  });

  test("a duplicated --config reports a command error on stderr and exits with the invalid-validate-arguments code", () => {
    const result = validateCommand.run(["--config", "a.kdl", "--config", "b.kdl"], "/irrelevant");

    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(CliExitCode.invalidValidateArguments);
    expect(result.stderr).toContain("duplicated option '--config'");
  });

  test("an unexpected positional argument reports a command error on stderr and exits with the invalid-validate-arguments code", () => {
    const result = validateCommand.run(["--config", "installerer.kdl", "extra"], "/irrelevant");

    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(CliExitCode.invalidValidateArguments);
    expect(result.stderr).toContain("unexpected positional argument 'extra'");
  });

  test("an unsupported option reports a command error on stderr and exits with the invalid-validate-arguments code", () => {
    const result = validateCommand.run(["--config", "installerer.kdl", "--bogus"], "/irrelevant");

    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(CliExitCode.invalidValidateArguments);
    expect(result.stderr).toContain("unsupported option");
  });
});
