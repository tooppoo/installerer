import { parseArgs } from "node:util";

import { CliExitCode } from "./exitCodes";
import { topLevelHelpText } from "./topLevelHelp";
import { cliVersion } from "./version";

export type CliDispatchResult = {
  stdout: string;
  stderr: string;
  exitCode: CliExitCode;
};

/**
 * Runtime-independent CLI dispatch. It only decides what a command should
 * print and exit with; writing to stdout/stderr and calling process.exit is
 * the responsibility of the runtime entrypoints (npm CLI, standalone
 * executable), which are out of scope for this issue.
 *
 * Only `--help` / `-h` and `--version` / `-v` are recognized here, plus the
 * no-argument case, which is treated the same as `--help`. Actual
 * subcommands (`init`, `generate`, `validate`, `doctor`) are not implemented
 * yet, so any positional argument is reported as an unknown command, even if
 * `--help` / `-h` or `--version` / `-v` also appear on the same command
 * line: `--help` / `--version` are only a top-level result when there is no
 * positional at all. Their own issues will extend this dispatch with real
 * handling and their own exit codes (see docs/exit-code.md).
 */
export function dispatchCli(argv: readonly string[]): CliDispatchResult {
  if (argv.length === 0) {
    return { stdout: topLevelHelpText, stderr: "", exitCode: CliExitCode.success };
  }

  try {
    const { values, positionals } = parseArgs({
      args: argv as string[],
      options: {
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
      allowPositionals: true,
    });

    if (positionals.length === 0) {
      if (values.help) {
        return { stdout: topLevelHelpText, stderr: "", exitCode: CliExitCode.success };
      }

      if (values.version) {
        return { stdout: `${cliVersion}\n`, stderr: "", exitCode: CliExitCode.success };
      }
    }

    const [command] = positionals;
    return {
      stdout: "",
      stderr: `installerer: unknown command '${command}'\n`,
      exitCode: CliExitCode.unknownCommand,
    };
  } catch (error) {
    return {
      stdout: "",
      stderr: `installerer: ${(error as Error).message}\n`,
      exitCode: CliExitCode.unknownOption,
    };
  }
}
