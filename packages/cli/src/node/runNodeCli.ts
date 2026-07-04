import { dispatchCli } from "../dispatch";

export type NodeCliIO = {
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  exit: (code: number) => void;
};

/**
 * Real process IO, used by the CLI entrypoint. Kept separate from
 * `runNodeCli` so tests can inject a fake `NodeCliIO` instead of exercising
 * `process.exit`.
 */
export const processNodeCliIO: NodeCliIO = {
  writeStdout(text) {
    if (text) process.stdout.write(text);
  },
  writeStderr(text) {
    if (text) process.stderr.write(text);
  },
  exit(code) {
    process.exit(code);
  },
};

/**
 * Node.js CLI runtime wiring: routes `dispatchCli`'s pure result to process
 * IO. This is the only place in the npm CLI runtime artifact allowed to
 * perform file IO / stdout / stderr / exit-code side effects (see
 * docs/adr/20260703T091000Z_cli-distribution-policy.md).
 */
export function runNodeCli(argv: readonly string[], io: NodeCliIO = processNodeCliIO): void {
  const result = dispatchCli(argv);
  io.writeStdout(result.stdout);
  io.writeStderr(result.stderr);
  io.exit(result.exitCode);
}
