import { parseArgs } from "node:util";

import { initCommand } from "./commands/init";
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
 * executable).
 *
 * `--help` / `-h` and `--version` / `-v` are recognized when there is no
 * positional at all, and are also honored ahead of a *recognized* command
 * name (currently only `init`) so `installerer init --help` reports help
 * instead of silently running `init`'s file-writing side effect. A
 * positional that is not a recognized command name still ignores
 * `--help`/`--version` and is reported as an unknown command, matching the
 * existing contract for not-yet-implemented commands. `init` (#88) is the
 * first real subcommand: it is routed to `CliCommandModule.run`, which may
 * perform its own file IO (see `commands/init.ts`) — that does not
 * reintroduce IO into this function itself, which still only builds the
 * result value. `cwd` defaults to the real process working directory so
 * production callers don't need to pass it, while tests can pass an
 * explicit directory instead. `generate` / `validate` / `doctor` (#89-#91)
 * replace the remaining unknown-command fallback the same way, and should
 * get the same help/version guard before their own file IO.
 */
export function dispatchCli(
  argv: readonly string[],
  cwd: string = process.cwd(),
): CliDispatchResult {
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

    const [command, ...rest] = positionals;

    if (command === initCommand.name) {
      if (values.help) {
        return { stdout: topLevelHelpText, stderr: "", exitCode: CliExitCode.success };
      }

      if (values.version) {
        return { stdout: `${cliVersion}\n`, stderr: "", exitCode: CliExitCode.success };
      }

      return initCommand.run(rest, cwd);
    }

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
