import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CliExitCode } from "../exitCodes";
import { topLevelHelpText } from "../topLevelHelp";
import { cliVersion } from "../version";
import { doctorCommand } from "./doctor";

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

const VALID_KDL_NO_VERSION_TEMPLATE = `installerer {
  source owner="tooppoo" repo="git-kura"

  binary name="git-kura" path-in-archive="git-kura"

  archive format="tar.gz" name-template="{repo}_{os}_{arch}.tar.gz" os-case="lowercase"

  checksum file-name="checksums.txt" algorithm="sha256"

  targets {
    target os="linux" arch="x86_64"
  }
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
  const dir = mkdtempSync(join(tmpdir(), "installerer-doctor-test-"));
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

describe("doctorCommand.run", () => {
  test("a valid config prints all doctor sections to stdout, writes nothing to stderr, and exits 0", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", VALID_KDL);

      const result = doctorCommand.run(["--config", "installerer.kdl"], dir);

      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(CliExitCode.success);

      expect(result.stdout).toContain("Config summary:");
      expect(result.stdout).toContain("- config file: installerer.kdl");
      expect(result.stdout).toContain("- repository: tooppoo/git-kura");
      expect(result.stdout).toContain("- binary: git-kura");
      expect(result.stdout).toContain("- archive format: tar.gz");
      expect(result.stdout).toContain("- targets: 4");

      expect(result.stdout).toContain("Archive preview:");
      expect(result.stdout).toContain("- linux/x86_64 latest:");
      expect(result.stdout).toContain("- linux/x86_64 pinned:");

      expect(result.stdout).toContain("Runtime requirements for this installer:");
      expect(result.stdout).toContain("Required commands:");

      expect(result.stdout).toContain("Helper diagnostics:");
      expect(result.stdout).toContain(
        "Typo check commands (display only; doctor does not run these):",
      );
      expect(result.stdout).toContain("- curl -fsIL");
      expect(result.stdout).toContain("Expected release assets:");
      expect(result.stdout).toContain("Latest URL preview:");
      expect(result.stdout).toContain("Pinned URL preview:");
      expect(result.stdout).toContain("Latest install notes:");
      expect(result.stdout).toContain("Install command examples:");
      expect(result.stdout).toContain("(rejected)");
    });
  });

  test("a valid config whose archive.nameTemplate has no {version} placeholder describes the versionless latest-install semantics", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", VALID_KDL_NO_VERSION_TEMPLATE);

      const result = doctorCommand.run(["--config", "installerer.kdl"], dir);

      expect(result.exitCode).toBe(CliExitCode.success);
      expect(result.stdout).toContain(
        "Latest install downloads checksum and archive assets directly from the latest release.",
      );
      expect(result.stdout).toContain("/releases/latest/download/");
    });
  });

  test("doctor never emits version-resolver or VERSION-asset language", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", VALID_KDL);

      const result = doctorCommand.run(["--config", "installerer.kdl"], dir);

      expect(result.stdout).not.toContain("version-resolver");
      expect(result.stdout).not.toContain("versionResolver");
      expect(result.stdout).not.toContain("VERSION asset");
    });
  });

  test("accepts an absolute --config path", () => {
    withTempDir((dir) => {
      const path = writeConfig(dir, "installerer.kdl", VALID_KDL);

      const result = doctorCommand.run(["--config", path], dir);

      expect(result.exitCode).toBe(CliExitCode.success);
    });
  });

  test("a valid config with warnings stays exit 0, prints warnings to stderr, and keeps stdout free of warning diagnostics", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", KDL_WITH_WARNING);

      const result = doctorCommand.run(["--config", "installerer.kdl"], dir);

      expect(result.exitCode).toBe(CliExitCode.success);
      expect(result.stdout).toContain("Config summary:");
      expect(result.stdout).not.toContain("warning[");
      expect(result.stderr).toContain("warning[semantic]");
      expect(result.stderr).toContain("installerer.archive.name-template");
      expect(result.stderr).toContain("recommended:");
    });
  });

  test("a semantically invalid config reports diagnostics on stderr and exits with the config-validation-failed code", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", SEMANTICALLY_INVALID_KDL);

      const result = doctorCommand.run(["--config", "installerer.kdl"], dir);

      expect(result.stdout).toBe("");
      expect(result.exitCode).toBe(CliExitCode.configValidationFailed);
      expect(result.stderr).toContain("error[semantic]");
      expect(result.stderr).toContain("installerer.source.owner");
    });
  });

  test("a config with a codec-shape error reports diagnostics on stderr and exits with the config-validation-failed code", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", CODEC_INVALID_KDL);

      const result = doctorCommand.run(["--config", "installerer.kdl"], dir);

      expect(result.stdout).toBe("");
      expect(result.exitCode).toBe(CliExitCode.configValidationFailed);
      expect(result.stderr).toContain("error[codec]");
      expect(result.stderr).toContain("installerer.checksum");
    });
  });

  test("invalid KDL syntax reports a root-level diagnostic on stderr and exits with the invalid-config-syntax code", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", SYNTACTICALLY_INVALID_KDL);

      const result = doctorCommand.run(["--config", "installerer.kdl"], dir);

      expect(result.stdout).toBe("");
      expect(result.exitCode).toBe(CliExitCode.invalidConfigSyntax);
      expect(result.stderr).toContain("error[syntax]");
    });
  });

  test("a missing config file reports a command error on stderr and exits with the config-file-read-failed code", () => {
    withTempDir((dir) => {
      const result = doctorCommand.run(["--config", "does-not-exist.kdl"], dir);

      expect(result.stdout).toBe("");
      expect(result.exitCode).toBe(CliExitCode.configFileReadFailed);
      expect(result.stderr).toContain("does-not-exist.kdl");
      expect(result.stderr).toContain("installerer init");
    });
  });

  // Relies on the OS enforcing file permissions against the test-runner's own UID; a root process bypasses permission bits entirely, so this would spuriously fail (read would succeed) under a root-by-default container.
  test.skipIf(process.getuid?.() === 0)(
    "an unreadable config file reports the system error on stderr and exits with the config-file-read-failed code",
    () => {
      withTempDir((dir) => {
        const path = writeConfig(dir, "installerer.kdl", VALID_KDL);
        chmodSync(path, 0o000);

        const result = doctorCommand.run(["--config", "installerer.kdl"], dir);

        expect(result.stdout).toBe("");
        expect(result.exitCode).toBe(CliExitCode.configFileReadFailed);
        expect(result.stderr).toContain("failed to read installerer.kdl");
      });
    },
  );

  test("missing --config reports a command error and usage on stderr and exits with the invalid-doctor-arguments code", () => {
    const result = doctorCommand.run([], "/irrelevant");

    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(CliExitCode.invalidDoctorArguments);
    expect(result.stderr).toContain("missing required option");
    expect(result.stderr).toContain("usage: installerer doctor --config <path>");
  });

  test("a duplicated --config reports a command error on stderr and exits with the invalid-doctor-arguments code", () => {
    const result = doctorCommand.run(["--config", "a.kdl", "--config", "b.kdl"], "/irrelevant");

    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(CliExitCode.invalidDoctorArguments);
    expect(result.stderr).toContain("duplicated option '--config'");
  });

  test("an unexpected positional argument reports a command error on stderr and exits with the invalid-doctor-arguments code", () => {
    const result = doctorCommand.run(["--config", "installerer.kdl", "extra"], "/irrelevant");

    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(CliExitCode.invalidDoctorArguments);
    expect(result.stderr).toContain("unexpected positional argument 'extra'");
  });

  test("an unsupported option reports a command error on stderr and exits with the invalid-doctor-arguments code", () => {
    const result = doctorCommand.run(["--config", "installerer.kdl", "--bogus"], "/irrelevant");

    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(CliExitCode.invalidDoctorArguments);
    expect(result.stderr).toContain("Unknown option");
    expect(result.stderr).toContain("--bogus");
  });

  test("a --config with no value reports a command error on stderr and exits with the invalid-doctor-arguments code", () => {
    const result = doctorCommand.run(["--config"], "/irrelevant");

    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(CliExitCode.invalidDoctorArguments);
  });

  test("--config immediately followed by --help is rejected as an ambiguous argument, not silently treated as help", () => {
    const result = doctorCommand.run(["--config", "--help"], "/irrelevant");

    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(CliExitCode.invalidDoctorArguments);
  });

  test("--help after a --config value still shows help, since --config only consumes the one value token that follows it", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", VALID_KDL);

      const result = doctorCommand.run(["--config", "installerer.kdl", "--help"], dir);

      expect(result).toEqual({
        stdout: topLevelHelpText,
        stderr: "",
        exitCode: CliExitCode.success,
      });
    });
  });

  test("--version after a --config value still shows the version, since --config only consumes the one value token that follows it", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", VALID_KDL);

      const result = doctorCommand.run(["--config", "installerer.kdl", "-v"], dir);

      expect(result).toEqual({
        stdout: `${cliVersion}\n`,
        stderr: "",
        exitCode: CliExitCode.success,
      });
    });
  });

  test("a valid config's full stdout matches the pinned doctor summary snapshot", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", VALID_KDL);

      const result = doctorCommand.run(["--config", "installerer.kdl"], dir);

      expect(result.stdout).toMatchSnapshot();
    });
  });
});
