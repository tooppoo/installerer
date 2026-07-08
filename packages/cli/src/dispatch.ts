import { parseArgs } from "node:util";

import type { CliCommandModule } from "./command";
import { initCommand } from "./commands/init";
import { validateCommand } from "./commands/validate";
import { CliExitCode } from "./exitCodes";
import { topLevelHelpText } from "./topLevelHelp";
import { cliVersion } from "./version";

export type CliDispatchResult = {
  stdout: string;
  stderr: string;
  exitCode: CliExitCode;
};

/**
 * Implemented generator-only commands, keyed by name. `generate` / `doctor`
 * (#89/#91) extend this list the same way `validate` (#90) does.
 */
const COMMANDS: readonly CliCommandModule[] = [initCommand, validateCommand];

function findCommand(name: string): CliCommandModule | undefined {
  return COMMANDS.find((command) => command.name === name);
}

/**
 * Runtime-independent CLI dispatch. It only decides what a command should
 * print and exit with; writing to stdout/stderr and calling process.exit is
 * the responsibility of the runtime entrypoints (npm CLI, standalone
 * executable). `cwd` defaults to the real process working directory so
 * production callers don't need to pass it, while tests can pass an
 * explicit directory instead.
 *
 * A recognized command name (`init`, `validate`, ...) is looked up directly
 * off `argv[0]`, without first running it through the top-level `parseArgs`
 * call below. This is deliberate: `validate` (#90) needs its own `--config`
 * option, and each future command (`generate`'s `--out`, ...) will need its
 * own option set. Folding all of those into one shared top-level schema
 * would mean every command's flags leak into every other command's argv, and
 * an unrecognized flag for one command would either have to be pre-declared
 * globally or fail before routing ever decided which command was even being
 * invoked. Instead, once a known command is found, `--help`/`-h` and
 * `--version`/`-v` are honored ahead of it (so `installerer validate --help`
 * reports help instead of running `validate`'s file IO) and everything else
 * about `rest` is that command's own business: `CliCommandModule.run` parses
 * its own args and returns its own result, including its own exit code for
 * its own argument errors (`validate`'s `invalidValidateArguments`, #90) —
 * `init` (#88) has no options of its own, so it rejects any leftover `rest`
 * itself and reuses the plain `unknownOption` exit code for that (see
 * `commands/init.ts`).
 *
 * When `argv[0]` is not a known command name (including no positional at
 * all, or a not-yet-implemented command like `generate`/`doctor`), the
 * original single-`parseArgs` fallback below still owns `--help`/`-h`/
 * `--version`/`-v` and the `unknownCommand`/`unknownOption` exit codes,
 * unchanged from before this command existed.
 */
export function dispatchCli(
  argv: readonly string[],
  cwd: string = process.cwd(),
): CliDispatchResult {
  if (argv.length === 0) {
    return { stdout: topLevelHelpText, stderr: "", exitCode: CliExitCode.success };
  }

  const [first, ...rest] = argv;
  const command = first !== undefined ? findCommand(first) : undefined;

  if (command !== undefined) {
    if (rest.includes("--help") || rest.includes("-h")) {
      return { stdout: topLevelHelpText, stderr: "", exitCode: CliExitCode.success };
    }

    if (rest.includes("--version") || rest.includes("-v")) {
      return { stdout: `${cliVersion}\n`, stderr: "", exitCode: CliExitCode.success };
    }

    return command.run(rest, cwd);
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

    const [unknownCommand] = positionals;

    return {
      stdout: "",
      stderr: `installerer: unknown command '${unknownCommand}'\n`,
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
