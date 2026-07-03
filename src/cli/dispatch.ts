import { topLevelHelpText } from "./topLevelHelp";

export type CliDispatchResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

/**
 * Runtime-independent CLI dispatch. It only decides what a command should
 * print and exit with; writing to stdout/stderr and calling process.exit is
 * the responsibility of the runtime entrypoints (npm CLI, standalone
 * executable), which are out of scope for this issue.
 *
 * Only `--help` / `-h` are recognized here. Other commands and the
 * no-argument case are left undefined and are handled by later issues.
 */
export function dispatchCli(argv: readonly string[]): CliDispatchResult | undefined {
  const [first] = argv;

  if (first === "--help" || first === "-h") {
    return { stdout: topLevelHelpText, stderr: "", exitCode: 0 };
  }

  return undefined;
}
