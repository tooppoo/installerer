import {
  configDiagnosticFromArchiveTemplateWarning,
  configDiagnosticFromKdlSyntaxError,
  formatConfigDiagnostics,
  parseKdlText,
  validateInstallerConfigKdl,
} from "@installerer/core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import type { CliCommandModule } from "../command";
import type { CliDispatchResult } from "../dispatch";
import { CliExitCode } from "../exitCodes";
import { topLevelHelpText } from "../topLevelHelp";
import { cliVersion } from "../version";

const USAGE = "installerer: usage: installerer validate --config <path>\n";

/**
 * `installerer validate --config <path>` (#90): reads a KDL config file,
 * runs it through the shared `parseKdlText` -> `validateInstallerConfigKdl`
 * pipeline, and reports the result via the `configDiagnostics` formatter
 * (#107) that `generate` (#89) will reuse.
 *
 * `validate` parses its own `args` instead of relying on `dispatchCli`'s
 * top-level `parseArgs`, so an argument problem specific to `validate`
 * (missing/duplicated `--config`, an unexpected positional, an option
 * `validate` doesn't support) is its own `invalidValidateArguments` cause
 * (exit 8) rather than the CLI-wide `unknownOption` (exit 2) — see
 * `dispatchCli`'s doc comment for why command-owned argument parsing
 * replaced a single shared schema. `--help`/`-h`/`--version`/`-v` are
 * declared in the *same* `parseArgs` call as `--config` (see
 * `parseValidateArgs`), rather than checked with a plain
 * `args.includes("--help")` the way `init` does: `--config` takes a value,
 * so a naive substring/array-includes check could misfire on
 * `--config --help` (forgotten value, next token happens to look like a
 * flag) and silently print help instead of a real argument error. Node's
 * `parseArgs` itself disambiguates that case correctly (it rejects it as an
 * ambiguous option argument), so routing `help`/`version` through the same
 * call gets that disambiguation for free.
 */
export const validateCommand: CliCommandModule = {
  name: "validate",

  run(args: readonly string[], cwd: string): CliDispatchResult {
    const parsedArgs = parseValidateArgs(args);

    if (parsedArgs.kind === "help") {
      return { stdout: topLevelHelpText, stderr: "", exitCode: CliExitCode.success };
    }

    if (parsedArgs.kind === "version") {
      return { stdout: `${cliVersion}\n`, stderr: "", exitCode: CliExitCode.success };
    }

    if (parsedArgs.kind === "error") {
      return parsedArgs.result;
    }

    const { configArg } = parsedArgs;
    const configPath = resolve(cwd, configArg);

    let text: string;
    try {
      text = readFileSync(configPath, "utf8");
    } catch (error) {
      return configReadFailure(configArg, error);
    }

    const parsed = parseKdlText(text);
    if (!parsed.ok) {
      return {
        stdout: "",
        stderr: formatConfigDiagnostics(parsed.errors.map(configDiagnosticFromKdlSyntaxError)),
        exitCode: CliExitCode.invalidConfigSyntax,
      };
    }

    const validated = validateInstallerConfigKdl(parsed.document);
    if (!validated.ok) {
      return {
        stdout: "",
        stderr: formatConfigDiagnostics(validated.diagnostics),
        exitCode: CliExitCode.configValidationFailed,
      };
    }

    const warningDiagnostics = validated.warnings.map(configDiagnosticFromArchiveTemplateWarning);

    return {
      stdout:
        `installerer: ${configArg} is valid.\n` +
        `installerer: ${validated.config.owner}/${validated.config.repo}, ` +
        `${validated.config.targets.length} target(s).\n`,
      stderr: formatConfigDiagnostics(warningDiagnostics),
      exitCode: CliExitCode.success,
    };
  },
};

type ParseValidateArgsResult =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "config"; configArg: string }
  | { kind: "error"; result: CliDispatchResult };

function parseValidateArgs(args: readonly string[]): ParseValidateArgsResult {
  let values: { config?: string[]; help?: boolean; version?: boolean };
  let positionals: string[];

  try {
    ({ values, positionals } = parseArgs({
      args: args as string[],
      options: {
        config: { type: "string", multiple: true },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
      allowPositionals: true,
    }));
  } catch (error) {
    return { kind: "error", result: invalidArguments((error as Error).message) };
  }

  if (values.help) {
    return { kind: "help" };
  }

  if (values.version) {
    return { kind: "version" };
  }

  if (positionals.length > 0) {
    return {
      kind: "error",
      result: invalidArguments(`unexpected positional argument '${positionals[0]}'`),
    };
  }

  const configValues = values.config ?? [];

  if (configValues.length === 0) {
    return { kind: "error", result: invalidArguments("missing required option '--config <path>'") };
  }

  if (configValues.length > 1) {
    return { kind: "error", result: invalidArguments("duplicated option '--config'") };
  }

  return { kind: "config", configArg: configValues[0]! };
}

function invalidArguments(reason: string): CliDispatchResult {
  return {
    stdout: "",
    stderr: `installerer: ${reason}\n${USAGE}`,
    exitCode: CliExitCode.invalidValidateArguments,
  };
}

function configReadFailure(configArg: string, error: unknown): CliDispatchResult {
  const errno = error as NodeJS.ErrnoException;
  const systemMessage = error instanceof Error ? error.message : String(error);
  const nextStep =
    errno.code === "ENOENT"
      ? `check the path, or run 'installerer init' to create ${configArg} if it does not exist yet.`
      : "check the path, permissions, and that it is a regular file.";

  return {
    stdout: "",
    stderr:
      `installerer: failed to read ${configArg}.\n` +
      `installerer: ${systemMessage}\n` +
      `installerer: ${nextStep}\n`,
    exitCode: CliExitCode.configFileReadFailed,
  };
}
