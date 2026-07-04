import type { CliDispatchResult } from "./dispatch";

/**
 * Interface each generator command module (`init`, `generate`, `validate`,
 * `doctor`) is expected to implement so `dispatchCli` can route to it by
 * name. Not yet consumed by `dispatchCli`: each command's own issue
 * (#88-#91) wires its module in and replaces the unknown-command fallback
 * for its name with a real `CliCommandModule.run` call.
 */
export type CliCommandModule = {
  readonly name: string;
  run(args: readonly string[]): CliDispatchResult;
};
