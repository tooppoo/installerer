import { parseArgs } from "node:util";

import type { CliCommandModule } from "./command";
import { doctorCommand } from "./commands/doctor";
import { generateCommand } from "./commands/generate";
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

/** Implemented generator-only commands, keyed by name. */
const COMMANDS: readonly CliCommandModule[] = [
  initCommand,
  validateCommand,
  generateCommand,
  doctorCommand,
];

function findCommand(name: string): CliCommandModule | undefined {
  return COMMANDS.find((command) => command.name === name);
}

/**
 * Runtime-independent CLI dispatch.
 * It only decides what a command should print and exit with; writing to stdout/stderr and calling process.exit is the responsibility of the runtime entrypoints (npm CLI, standalone executable).
 * `cwd` defaults to the real process working directory so production callers don't need to pass it, while tests can pass an explicit directory instead.
 *
 * A recognized command name (`init`, `validate`, `generate`, `doctor`, ...) is looked up directly off `argv[0]`, without first running it through the top-level `parseArgs` call below.
 * This is deliberate: `validate` (#90) needs its own `--config` option, `generate` (#89) needs its own `--config`/`--out`, `doctor` (#91) needs its own `--config`, and each future command will need its own option set.
 * Folding all of those into one shared top-level schema would mean every command's flags leak into every other command's argv, and an unrecognized flag for one command would either have to be pre-declared globally or fail before routing ever decided which command was even being invoked.
 * Once a known command is found, `rest` is that command's own business end to end, including `--help`/`-h`/`--version`/`-v`: `CliCommandModule.run` parses its own args (via its own `parseArgs` call) and returns its own result.
 * This dispatch function deliberately does not pre-scan `rest` for `--help`/`--version` itself, e.g. via a plain `rest.includes("--help")` check: a command with a value-taking option (`validate`'s/`doctor`'s `--config <path>`, `generate`'s `--config`/`--out`) could have that value collide with a flag spelling (`--config --help`), and only the command's own `parseArgs` call knows which token is consumed as an option's value versus a bare flag.
 * So `validate` (#90), `generate` (#89), and `doctor` (#91) declare `help`/`version` alongside their own options in their own `parseArgs` schema; `init` (#88) has no value-taking options, so it can safely check `args.includes(...)` directly.
 * Each command also picks its own exit code for its own argument errors (`validate`'s `invalidValidateArguments`, `generate`'s `invalidGenerateArguments`, `doctor`'s `invalidDoctorArguments`; `init` has none of its own, so it reuses the plain `unknownOption`) — see `commands/init.ts`, `commands/validate.ts`, `commands/generate.ts`, and `commands/doctor.ts`.
 *
 * When `argv[0]` is not a known command name (including no positional at all), the original single-`parseArgs` fallback below still owns `--help`/`-h`/`--version`/`-v` and the `unknownCommand`/`unknownOption` exit codes, unchanged from before any generator-only command existed.
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
