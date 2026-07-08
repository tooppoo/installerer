import {
  configDiagnosticFromArchiveTemplateWarning,
  configDiagnosticFromKdlSyntaxError,
  formatConfigDiagnostics,
  generateInstaller,
  parseKdlText,
  validateInstallerConfigKdl,
} from "@installerer/core";
import { randomBytes } from "node:crypto";
import {
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

import type { CliCommandModule } from "../command";
import type { CliDispatchResult } from "../dispatch";
import { CliExitCode } from "../exitCodes";
import { topLevelHelpText } from "../topLevelHelp";
import { cliVersion } from "../version";

const USAGE = "installerer: usage: installerer generate --config <path> --out <path>\n";

/**
 * `installerer generate --config <path> --out <path>` (#89): reads a KDL config file through the same `parseKdlText` -> `validateInstallerConfigKdl` pipeline `validate` (#90) uses, then feeds the validated config to `generateInstaller` and writes the resulting installer script to `--out`.
 *
 * `generate` is an artifact-producing command, not a Unix filter: v0 requires `--out` and never writes the generated installer body to stdout (see the Issue #89 "出力方針" section), so a large generated script can't land in terminal scrollback or a CI log by accident. `--out -` is therefore rejected as an invalid argument rather than treated as "write to stdout".
 *
 * Argument parsing mirrors `validate.ts`: `--help`/`-h`/`--version`/`-v` are declared in the same `parseArgs` call as `--config`/`--out` so that a value-taking option's argument (e.g. a forgotten `--out` value where the next token looks like `--help`) is disambiguated by `parseArgs` itself instead of a naive `args.includes(...)` check silently misreading it.
 */
export const generateCommand: CliCommandModule = {
  name: "generate",

  run(args: readonly string[], cwd: string): CliDispatchResult {
    const parsedArgs = parseGenerateArgs(args);

    if (parsedArgs.kind === "help") {
      return { stdout: topLevelHelpText, stderr: "", exitCode: CliExitCode.success };
    }

    if (parsedArgs.kind === "version") {
      return { stdout: `${cliVersion}\n`, stderr: "", exitCode: CliExitCode.success };
    }

    if (parsedArgs.kind === "error") {
      return parsedArgs.result;
    }

    const { configArg, outArg } = parsedArgs;
    const configPath = resolve(cwd, configArg);
    const outPath = resolve(cwd, outArg);

    if (isSameConfigAndOutPath(configPath, outPath)) {
      return invalidArguments(
        `--config and --out must not point to the same path ('${configArg}' and '${outArg}')`,
      );
    }

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

    let installerScript: string;
    try {
      installerScript = generateInstaller(validated.config, cliVersion);
    } catch (error) {
      return installerGenerationFailure(error);
    }

    const writeResult = writeOutputAtomically(outPath, installerScript);
    if (!writeResult.ok) {
      return outputWriteFailure(outArg, writeResult.error);
    }

    const warningDiagnostics = validated.warnings.map(configDiagnosticFromArchiveTemplateWarning);

    return {
      stdout:
        `installerer: wrote ${outArg} from ${configArg}.\n` +
        `installerer: ${validated.config.owner}/${validated.config.repo}, ` +
        `${validated.config.targets.length} target(s).\n`,
      stderr: formatConfigDiagnostics(warningDiagnostics),
      exitCode: CliExitCode.success,
    };
  },
};

type ParseGenerateArgsResult =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "args"; configArg: string; outArg: string }
  | { kind: "error"; result: CliDispatchResult };

function parseGenerateArgs(args: readonly string[]): ParseGenerateArgsResult {
  let values: { config?: string[]; out?: string[]; help?: boolean; version?: boolean };
  let positionals: string[];

  try {
    ({ values, positionals } = parseArgs({
      args: args as string[],
      options: {
        config: { type: "string", multiple: true },
        out: { type: "string", multiple: true },
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

  const outValues = values.out ?? [];

  if (outValues.length === 0) {
    return { kind: "error", result: invalidArguments("missing required option '--out <path>'") };
  }

  if (outValues.length > 1) {
    return { kind: "error", result: invalidArguments("duplicated option '--out'") };
  }

  const outArg = outValues[0]!;

  if (outArg === "-") {
    return {
      kind: "error",
      result: invalidArguments("'--out -' (stdout) is not supported in v0"),
    };
  }

  return { kind: "args", configArg: configValues[0]!, outArg };
}

/**
 * `--config` and `--out` are compared as `path.resolve(cwd, value)` first (the mandatory check per #89), then, only when both paths already exist, by `realpath` so a symlink pointing at the same file is also caught. A `realpath` failure (e.g. a permission error on an intermediate directory) falls back to the resolved-path comparison already performed, per #89's "realpath 不能な場合は... resolved absolute path の比較に fallback してよい".
 */
function isSameConfigAndOutPath(configPath: string, outPath: string): boolean {
  if (configPath === outPath) {
    return true;
  }

  try {
    return realpathSync(configPath) === realpathSync(outPath);
  } catch {
    return false;
  }
}

type WriteOutputResult = { ok: true } | { ok: false; error: unknown };

/**
 * Atomic replace (#89 "overwrite policy"): the output parent directory must already exist and be a directory (no auto-`mkdir`), the output path itself must not be a directory, and the generated installer is written to an exclusively-created (`wx`) temporary file in that same directory before being renamed onto `outPath`. Any failure before the rename leaves an existing `outPath` untouched; a temporary file left behind by a failed write is best-effort cleaned up.
 */
function writeOutputAtomically(outPath: string, content: string): WriteOutputResult {
  const parentDir = dirname(outPath);

  let parentStat: ReturnType<typeof statSync>;
  try {
    parentStat = statSync(parentDir);
  } catch (error) {
    return { ok: false, error };
  }

  if (!parentStat.isDirectory()) {
    return { ok: false, error: new Error(`${parentDir} is not a directory`) };
  }

  try {
    const outStat = statSync(outPath);
    if (outStat.isDirectory()) {
      return { ok: false, error: new Error(`${outPath} is a directory`) };
    }
  } catch {
    // outPath not existing yet is fine; any other stat failure surfaces below at write/rename time.
  }

  const tempPath = join(parentDir, `.installerer-generate-${randomBytes(8).toString("hex")}.tmp`);

  try {
    writeFileSync(tempPath, content, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    return { ok: false, error };
  }

  try {
    renameSync(tempPath, outPath);
  } catch (error) {
    tryUnlink(tempPath);
    return { ok: false, error };
  }

  return { ok: true };
}

function tryUnlink(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // best-effort cleanup only; a failure here must not mask the original write/rename error.
  }
}

function invalidArguments(reason: string): CliDispatchResult {
  return {
    stdout: "",
    stderr: `installerer: ${reason}\n${USAGE}`,
    exitCode: CliExitCode.invalidGenerateArguments,
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

function outputWriteFailure(outArg: string, error: unknown): CliDispatchResult {
  const systemMessage = error instanceof Error ? error.message : String(error);

  return {
    stdout: "",
    stderr:
      `installerer: failed to write ${outArg}.\n` +
      `installerer: ${systemMessage}\n` +
      `installerer: check that the parent directory of ${outArg} exists, is a directory, ` +
      `and is writable, and that ${outArg} itself is not a directory.\n`,
    exitCode: CliExitCode.outputFileWriteFailed,
  };
}

function installerGenerationFailure(error: unknown): CliDispatchResult {
  const systemMessage = error instanceof Error ? error.message : String(error);

  return {
    stdout: "",
    stderr: `installerer: failed to generate the installer.\ninstallerer: ${systemMessage}\n`,
    exitCode: CliExitCode.installerGenerationFailed,
  };
}
