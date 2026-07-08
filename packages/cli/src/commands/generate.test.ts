import { generateInstaller, parseKdlText, validateInstallerConfigKdl } from "@installerer/core";
import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CliExitCode } from "../exitCodes";
import { topLevelHelpText } from "../topLevelHelp";
import { cliVersion } from "../version";
import { generateCommand, runGenerate, writeOutputAtomically } from "./generate";

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
  const dir = mkdtempSync(join(tmpdir(), "installerer-generate-test-"));
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

describe("generateCommand.run", () => {
  test("a valid config writes the generated installer to --out, prints a success summary to stdout, writes nothing to stderr, and exits 0", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", VALID_KDL);

      const result = generateCommand.run(
        ["--config", "installerer.kdl", "--out", "install.sh"],
        dir,
      );

      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(CliExitCode.success);
      expect(result.stdout).toContain("install.sh");
      expect(result.stdout).toContain("installerer.kdl");
      expect(result.stdout).toContain("tooppoo/git-kura");
      expect(result.stdout).toContain("4 target(s)");

      const written = readFileSync(join(dir, "install.sh"), "utf8");
      expect(written).not.toBe("");
    });
  });

  test("the written file matches generateInstaller(validated.config, cliVersion) exactly", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", VALID_KDL);

      generateCommand.run(["--config", "installerer.kdl", "--out", "install.sh"], dir);

      const written = readFileSync(join(dir, "install.sh"), "utf8");

      const parsed = parseKdlText(VALID_KDL);
      if (!parsed.ok) throw new Error("expected VALID_KDL to parse");
      const validated = validateInstallerConfigKdl(parsed.document);
      if (!validated.ok) throw new Error("expected VALID_KDL to validate");

      expect(written).toBe(generateInstaller(validated.config, cliVersion));
    });
  });

  test("the generated output file does not have the executable bit set", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", VALID_KDL);

      generateCommand.run(["--config", "installerer.kdl", "--out", "install.sh"], dir);

      const mode = statSync(join(dir, "install.sh")).mode;
      expect(mode & 0o111).toBe(0);
    });
  });

  test("no stray temporary files are left behind in the output directory after a successful write", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", VALID_KDL);

      generateCommand.run(["--config", "installerer.kdl", "--out", "install.sh"], dir);

      const entries = readdirSync(dir);
      expect(entries.sort()).toEqual(["install.sh", "installerer.kdl"]);
    });
  });

  test("a valid config with warnings still writes the file, stays exit 0, and prints warnings to stderr while keeping stdout to the success summary", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", KDL_WITH_WARNING);

      const result = generateCommand.run(
        ["--config", "installerer.kdl", "--out", "install.sh"],
        dir,
      );

      expect(result.exitCode).toBe(CliExitCode.success);
      expect(result.stdout).not.toContain("warning[");
      expect(result.stderr).toContain("warning[semantic]");
      expect(existsSync(join(dir, "install.sh"))).toBe(true);
    });
  });

  test("--out replaces an existing file only on success, atomically", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", VALID_KDL);
      writeConfig(dir, "install.sh", "#!/bin/sh\necho old\n");

      const result = generateCommand.run(
        ["--config", "installerer.kdl", "--out", "install.sh"],
        dir,
      );

      expect(result.exitCode).toBe(CliExitCode.success);
      const written = readFileSync(join(dir, "install.sh"), "utf8");
      expect(written).not.toContain("echo old");
    });
  });

  test("a generateInstaller throw does not create the output file and exits with the installer-generation-failed code", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", VALID_KDL);

      const throwingGenerateFn = () => {
        throw new Error("simulated generator failure");
      };

      const result = runGenerate(
        ["--config", "installerer.kdl", "--out", "install.sh"],
        dir,
        throwingGenerateFn,
      );

      expect(result.stdout).toBe("");
      expect(result.exitCode).toBe(CliExitCode.installerGenerationFailed);
      expect(result.stderr).toContain("simulated generator failure");
      expect(existsSync(join(dir, "install.sh"))).toBe(false);
    });
  });

  test("a generateInstaller throw does not overwrite an existing output file", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", VALID_KDL);
      writeConfig(dir, "install.sh", "#!/bin/sh\necho old\n");

      const throwingGenerateFn = () => {
        throw new Error("simulated generator failure");
      };

      const result = runGenerate(
        ["--config", "installerer.kdl", "--out", "install.sh"],
        dir,
        throwingGenerateFn,
      );

      expect(result.exitCode).toBe(CliExitCode.installerGenerationFailed);
      expect(readFileSync(join(dir, "install.sh"), "utf8")).toContain("echo old");
    });
  });

  test("a semantically invalid config does not create the output file and exits with the config-validation-failed code", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", SEMANTICALLY_INVALID_KDL);

      const result = generateCommand.run(
        ["--config", "installerer.kdl", "--out", "install.sh"],
        dir,
      );

      expect(result.stdout).toBe("");
      expect(result.exitCode).toBe(CliExitCode.configValidationFailed);
      expect(result.stderr).toContain("error[semantic]");
      expect(existsSync(join(dir, "install.sh"))).toBe(false);
    });
  });

  test("a semantically invalid config does not overwrite an existing output file", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", SEMANTICALLY_INVALID_KDL);
      writeConfig(dir, "install.sh", "#!/bin/sh\necho old\n");

      const result = generateCommand.run(
        ["--config", "installerer.kdl", "--out", "install.sh"],
        dir,
      );

      expect(result.exitCode).toBe(CliExitCode.configValidationFailed);
      expect(readFileSync(join(dir, "install.sh"), "utf8")).toContain("echo old");
    });
  });

  test("a config with a codec-shape error does not create the output file and exits with the config-validation-failed code", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", CODEC_INVALID_KDL);

      const result = generateCommand.run(
        ["--config", "installerer.kdl", "--out", "install.sh"],
        dir,
      );

      expect(result.stdout).toBe("");
      expect(result.exitCode).toBe(CliExitCode.configValidationFailed);
      expect(result.stderr).toContain("error[codec]");
      expect(existsSync(join(dir, "install.sh"))).toBe(false);
    });
  });

  test("invalid KDL syntax does not create the output file and exits with the invalid-config-syntax code", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", SYNTACTICALLY_INVALID_KDL);

      const result = generateCommand.run(
        ["--config", "installerer.kdl", "--out", "install.sh"],
        dir,
      );

      expect(result.stdout).toBe("");
      expect(result.exitCode).toBe(CliExitCode.invalidConfigSyntax);
      expect(result.stderr).toContain("error[syntax]");
      expect(existsSync(join(dir, "install.sh"))).toBe(false);
    });
  });

  test("a missing config file reports a command error on stderr and exits with the config-file-read-failed code", () => {
    withTempDir((dir) => {
      const result = generateCommand.run(
        ["--config", "does-not-exist.kdl", "--out", "install.sh"],
        dir,
      );

      expect(result.stdout).toBe("");
      expect(result.exitCode).toBe(CliExitCode.configFileReadFailed);
      expect(result.stderr).toContain("does-not-exist.kdl");
      expect(existsSync(join(dir, "install.sh"))).toBe(false);
    });
  });

  test("an output parent directory that does not exist reports a command error and exits with the output-file-write-failed code", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", VALID_KDL);

      const result = generateCommand.run(
        ["--config", "installerer.kdl", "--out", "no-such-dir/install.sh"],
        dir,
      );

      expect(result.stdout).toBe("");
      expect(result.exitCode).toBe(CliExitCode.outputFileWriteFailed);
    });
  });

  test("an output parent path that is not a directory reports a command error and exits with the output-file-write-failed code", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", VALID_KDL);
      writeConfig(dir, "not-a-dir", "just a file\n");

      const result = generateCommand.run(
        ["--config", "installerer.kdl", "--out", "not-a-dir/install.sh"],
        dir,
      );

      expect(result.stdout).toBe("");
      expect(result.exitCode).toBe(CliExitCode.outputFileWriteFailed);
    });
  });

  test("an output path that is itself a directory reports a command error and exits with the output-file-write-failed code", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", VALID_KDL);
      mkdirSync(join(dir, "install.sh"));

      const result = generateCommand.run(
        ["--config", "installerer.kdl", "--out", "install.sh"],
        dir,
      );

      expect(result.stdout).toBe("");
      expect(result.exitCode).toBe(CliExitCode.outputFileWriteFailed);
    });
  });

  // Relies on the OS enforcing file permissions against the test-runner's own UID; a root process bypasses permission bits entirely, so this would spuriously fail under a root-by-default container.
  test.skipIf(process.getuid?.() === 0)(
    "an output directory without write permission reports a command error and exits with the output-file-write-failed code",
    () => {
      withTempDir((dir) => {
        writeConfig(dir, "installerer.kdl", VALID_KDL);
        const outDir = join(dir, "readonly-out");
        mkdirSync(outDir);
        chmodSync(outDir, 0o500);

        try {
          const result = generateCommand.run(
            ["--config", "installerer.kdl", "--out", "readonly-out/install.sh"],
            dir,
          );

          expect(result.exitCode).toBe(CliExitCode.outputFileWriteFailed);
        } finally {
          chmodSync(outDir, 0o700);
        }
      });
    },
  );

  test("--config and --out pointing at the same resolved path are rejected as invalid arguments", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", VALID_KDL);

      const result = generateCommand.run(
        ["--config", "./installerer.kdl", "--out", "installerer.kdl"],
        dir,
      );

      expect(result.stdout).toBe("");
      expect(result.exitCode).toBe(CliExitCode.invalidGenerateArguments);
      expect(result.stderr).toContain("same path");
    });
  });

  test("--config and --out pointing at the same file through a symlink are rejected as invalid arguments", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", VALID_KDL);
      symlinkSync(join(dir, "installerer.kdl"), join(dir, "installerer-link.kdl"));

      const result = generateCommand.run(
        ["--config", "installerer.kdl", "--out", "installerer-link.kdl"],
        dir,
      );

      expect(result.stdout).toBe("");
      expect(result.exitCode).toBe(CliExitCode.invalidGenerateArguments);
    });
  });

  test("missing --config reports a command error and usage on stderr and exits with the invalid-generate-arguments code", () => {
    const result = generateCommand.run(["--out", "install.sh"], "/irrelevant");

    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(CliExitCode.invalidGenerateArguments);
    expect(result.stderr).toContain("missing required option '--config");
    expect(result.stderr).toContain("usage: installerer generate --config <path> --out <path>");
  });

  test("missing --out reports a command error and usage on stderr and exits with the invalid-generate-arguments code", () => {
    const result = generateCommand.run(["--config", "installerer.kdl"], "/irrelevant");

    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(CliExitCode.invalidGenerateArguments);
    expect(result.stderr).toContain("missing required option '--out");
  });

  test("a duplicated --config reports a command error on stderr and exits with the invalid-generate-arguments code", () => {
    const result = generateCommand.run(
      ["--config", "a.kdl", "--config", "b.kdl", "--out", "install.sh"],
      "/irrelevant",
    );

    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(CliExitCode.invalidGenerateArguments);
    expect(result.stderr).toContain("duplicated option '--config'");
  });

  test("a duplicated --out reports a command error on stderr and exits with the invalid-generate-arguments code", () => {
    const result = generateCommand.run(
      ["--config", "installerer.kdl", "--out", "a.sh", "--out", "b.sh"],
      "/irrelevant",
    );

    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(CliExitCode.invalidGenerateArguments);
    expect(result.stderr).toContain("duplicated option '--out'");
  });

  test("--out - is rejected as unsupported in v0", () => {
    const result = generateCommand.run(
      ["--config", "installerer.kdl", "--out", "-"],
      "/irrelevant",
    );

    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(CliExitCode.invalidGenerateArguments);
    expect(result.stderr).toContain("not supported");
  });

  test("an unexpected positional argument reports a command error on stderr and exits with the invalid-generate-arguments code", () => {
    const result = generateCommand.run(
      ["--config", "installerer.kdl", "--out", "install.sh", "extra"],
      "/irrelevant",
    );

    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(CliExitCode.invalidGenerateArguments);
    expect(result.stderr).toContain("unexpected positional argument 'extra'");
  });

  test("an unsupported option reports a command error on stderr and exits with the invalid-generate-arguments code", () => {
    const result = generateCommand.run(
      ["--config", "installerer.kdl", "--out", "install.sh", "--bogus"],
      "/irrelevant",
    );

    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(CliExitCode.invalidGenerateArguments);
    expect(result.stderr).toContain("Unknown option");
  });

  test("--help prints help text instead of running generate", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", VALID_KDL);

      const result = generateCommand.run(
        ["--config", "installerer.kdl", "--out", "install.sh", "--help"],
        dir,
      );

      expect(result).toEqual({
        stdout: topLevelHelpText,
        stderr: "",
        exitCode: CliExitCode.success,
      });
      expect(existsSync(join(dir, "install.sh"))).toBe(false);
    });
  });

  test("--version prints the version instead of running generate", () => {
    withTempDir((dir) => {
      writeConfig(dir, "installerer.kdl", VALID_KDL);

      const result = generateCommand.run(
        ["--config", "installerer.kdl", "--out", "install.sh", "-v"],
        dir,
      );

      expect(result).toEqual({
        stdout: `${cliVersion}\n`,
        stderr: "",
        exitCode: CliExitCode.success,
      });
      expect(existsSync(join(dir, "install.sh"))).toBe(false);
    });
  });
});

describe("writeOutputAtomically", () => {
  test("cleans up the temporary file and leaves an existing --out untouched when the rename step fails", () => {
    withTempDir((dir) => {
      const outPath = join(dir, "install.sh");
      writeFileSync(outPath, "#!/bin/sh\necho old\n");

      const failingRename = () => {
        throw new Error("simulated rename failure");
      };

      const result = writeOutputAtomically(outPath, "new content", failingRename);

      expect(result.ok).toBe(false);
      expect(readFileSync(outPath, "utf8")).toBe("#!/bin/sh\necho old\n");
      expect(readdirSync(dir)).toEqual(["install.sh"]);
    });
  });

  test("succeeds and leaves no temporary file behind when rename succeeds", () => {
    withTempDir((dir) => {
      const outPath = join(dir, "install.sh");

      const result = writeOutputAtomically(outPath, "new content");

      expect(result.ok).toBe(true);
      expect(readFileSync(outPath, "utf8")).toBe("new content");
      expect(readdirSync(dir)).toEqual(["install.sh"]);
    });
  });
});
