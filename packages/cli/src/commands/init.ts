import { writeFileSync } from "node:fs";
import { join } from "node:path";

import type { CliCommandModule } from "../command";
import type { CliDispatchResult } from "../dispatch";
import { CliExitCode } from "../exitCodes";
import { topLevelHelpText } from "../topLevelHelp";
import { cliVersion } from "../version";

export const CONFIG_FILE_NAME = "installerer.kdl";

/**
 * `installerer init` config template (#88): the canonical KDL subset from
 * #99, in the fixed node/property order `decodeInstallerConfigKdl` enforces
 * (source, binary, archive, checksum, targets, architecture-labels,
 * defaults). No `version-resolver` node: that config concept was removed by
 * #111 in favor of detecting `{version}` in `archive.name-template`, so a
 * template still emitting `version-resolver` would be rejected by the codec
 * as an unknown child node.
 *
 * Sample values are generic placeholders that satisfy `GITHUB_OWNER_PATTERN`
 * / `GITHUB_REPO_PATTERN` / `validateSafeFilename`, not a real repository;
 * `init.test.ts` asserts this text parses, decodes, and validates.
 */
export const INIT_CONFIG_TEMPLATE = `installerer {
  source owner="your-owner" repo="your-repo"

  binary name="your-binary" path-in-archive="your-binary"

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

/**
 * Writes `installerer.kdl` to `cwd`, never overwriting an existing file (v0
 * has no `--force`/`--out`; see #88). `init` has no options of its own, so
 * `dispatchCli` (#90) hands it `rest` unfiltered. `init` checks for
 * `--help`/`-h`/`--version`/`-v` itself via a plain `Array.includes` (safe
 * here specifically because `init` has no value-taking option whose value
 * could collide with one of those spellings — unlike `validate`'s
 * `--config`, which parses `--help`/`--version` through its own `parseArgs`
 * call instead; see `dispatchCli`'s doc comment). Any other leftover
 * argument (a stray `--force`, an unexpected positional, ...) is rejected
 * here and reuses the plain `unknownOption` exit code, since `init` has no
 * command-specific argument-error cause of its own to introduce.
 *
 * Uses the `wx` flag (create-only, fails if the path exists) instead of a
 * separate `existsSync` check followed by a plain write: two separate
 * syscalls would leave a check-then-act race where a file created between
 * the check and the write gets silently clobbered instead of reported as
 * "already exists".
 */
export const initCommand: CliCommandModule = {
  name: "init",

  run(args: readonly string[], cwd: string): CliDispatchResult {
    if (args.includes("--help") || args.includes("-h")) {
      return { stdout: topLevelHelpText, stderr: "", exitCode: CliExitCode.success };
    }

    if (args.includes("--version") || args.includes("-v")) {
      return { stdout: `${cliVersion}\n`, stderr: "", exitCode: CliExitCode.success };
    }

    if (args.length > 0) {
      return {
        stdout: "",
        stderr: `installerer: unknown option '${args[0]}' for 'init'\n`,
        exitCode: CliExitCode.unknownOption,
      };
    }

    const configPath = join(cwd, CONFIG_FILE_NAME);

    try {
      writeFileSync(configPath, INIT_CONFIG_TEMPLATE, { flag: "wx" });
    } catch (error) {
      const errno = error as NodeJS.ErrnoException;

      if (errno.code === "EEXIST") {
        return {
          stdout: "",
          stderr:
            `installerer: ${CONFIG_FILE_NAME} already exists in the current directory.\n` +
            `installerer: check the existing file, move it aside, delete it, or pass it to 'installerer validate' or 'installerer generate' instead.\n`,
          exitCode: CliExitCode.configFileAlreadyExists,
        };
      }

      const systemMessage = error instanceof Error ? error.message : String(error);
      return {
        stdout: "",
        stderr:
          `installerer: failed to write ${CONFIG_FILE_NAME}.\n` +
          `installerer: ${systemMessage}\n` +
          `installerer: check write permission, the path, and disk space for the current directory.\n`,
        exitCode: CliExitCode.configFileWriteFailed,
      };
    }

    return {
      stdout: `created ${CONFIG_FILE_NAME}\n`,
      stderr: "",
      exitCode: CliExitCode.success,
    };
  },
};
