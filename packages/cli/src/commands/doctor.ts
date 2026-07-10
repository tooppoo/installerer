import {
  buildInstallerDiagnostics,
  configDiagnosticFromArchiveTemplateWarning,
  configDiagnosticFromKdlSyntaxError,
  formatConfigDiagnostics,
  parseKdlText,
  resolveRuntimeDependencies,
  validateInstallerConfigKdl,
  type InstallerConfig,
  type InstallerDiagnostics,
} from "@installerer/core";
import type { ArchiveNamePreview } from "@installerer/core/archiveTemplate";
import { renderRuntimeRequirementsText } from "@installerer/core/runtimeDependencies/renderText";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import type { CliCommandModule } from "../command";
import type { CliDispatchResult } from "../dispatch";
import { CliExitCode } from "../exitCodes";
import { topLevelHelpText } from "../topLevelHelp";
import { cliVersion } from "../version";

const USAGE = "installerer: usage: installerer doctor --config <path>\n";

/**
 * `installerer doctor --config <path>` (#91): runs a KDL config through the same `parseKdlText` -> `validateInstallerConfigKdl` pipeline `validate` (#90) and `generate` (#89) use, then renders human-readable preview/diagnostics sections instead of writing an installer.
 *
 * `doctor` performs no external reachability checks and introduces no `fetch`/`node:http(s)`/`child_process` usage: v0 scope excludes confirming that the repository, release assets, or checksum file actually exist (issue #91 "対象外"). `buildInstallerDiagnostics`'s `curl` strings are display-only typo-check hints for the user to run themselves.
 *
 * Argument parsing mirrors `validate.ts`/`generate.ts`: `--help`/`-h`/`--version`/`-v` are declared in the same `parseArgs` call as `--config` so a forgotten `--config` value can't be misread as a bare flag.
 */
export const doctorCommand: CliCommandModule = {
  name: "doctor",

  run(args: readonly string[], cwd: string): CliDispatchResult {
    const parsedArgs = parseDoctorArgs(args);

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
      stdout: renderDoctorSummary(configArg, validated.config, validated.archivePreviews),
      stderr: formatConfigDiagnostics(warningDiagnostics),
      exitCode: CliExitCode.success,
    };
  },
};

function renderDoctorSummary(
  configArg: string,
  config: InstallerConfig,
  archivePreviews: readonly ArchiveNamePreview[],
): string {
  const runtimeRequirementsText = renderRuntimeRequirementsText(resolveRuntimeDependencies(config));
  const diagnostics = buildInstallerDiagnostics(config, [...archivePreviews]);

  const blocks = [
    renderConfigSummary(configArg, config),
    renderArchivePreview(archivePreviews),
    runtimeRequirementsText.trimEnd(),
    ...renderHelperDiagnostics(diagnostics),
  ];

  return `${blocks.join("\n\n")}\n`;
}

function renderConfigSummary(configArg: string, config: InstallerConfig): string {
  return [
    "Config summary:",
    `- config file: ${configArg}`,
    `- repository: ${config.owner}/${config.repo}`,
    `- binary: ${config.binary.name}`,
    `- archive format: ${config.archive.format}`,
    `- targets: ${config.targets.length}`,
  ].join("\n");
}

function renderArchivePreview(archivePreviews: readonly ArchiveNamePreview[]): string {
  const lines = archivePreviews.flatMap((preview) => [
    `- ${preview.os}/${preview.arch} latest: ${preview.latestName}`,
    `- ${preview.os}/${preview.arch} pinned: ${preview.pinnedName}`,
  ]);

  return ["Archive preview:", ...lines].join("\n");
}

/**
 * Returns one block per `InstallerDiagnostics` field rather than one merged block, matching `renderRuntimeRequirementsText`'s "one topic per blank-line-separated block" convention that `renderDoctorSummary` already follows for the other sections.
 */
function renderHelperDiagnostics(diagnostics: InstallerDiagnostics): string[] {
  return [
    "Helper diagnostics:",
    bulletBlock(
      "Typo check commands (display only; doctor does not run these):",
      diagnostics.typoCommands,
    ),
    bulletBlock("Expected release assets:", diagnostics.expectedReleaseAssets),
    bulletBlock("Latest URL preview:", diagnostics.urls.latest),
    bulletBlock("Pinned URL preview:", diagnostics.urls.pinned),
    bulletBlock("Latest install notes:", diagnostics.latestInstallNotes),
    bulletBlock("Install command examples:", [
      ...diagnostics.installCommands.valid,
      ...diagnostics.installCommands.invalid.map((command) => `${command} (rejected)`),
    ]),
  ];
}

function bulletBlock(header: string, lines: readonly string[]): string {
  return [header, ...lines.map((line) => `- ${line}`)].join("\n");
}

type ParseDoctorArgsResult =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "config"; configArg: string }
  | { kind: "error"; result: CliDispatchResult };

function parseDoctorArgs(args: readonly string[]): ParseDoctorArgsResult {
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
    return {
      kind: "error",
      result: invalidArguments("missing required option '--config <path>'"),
    };
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
    exitCode: CliExitCode.invalidDoctorArguments,
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
