import type { CliDispatchResult } from "./dispatch";

/**
 * Interface each generator command module (`init`, `generate`, `validate`,
 * `doctor`) is expected to implement so `dispatchCli` can route to it by
 * name. First consumed by `init` (#88); `generate`/`validate`/`doctor`
 * (#89-#91) replace the remaining unknown-command fallback the same way.
 *
 * `cwd` is passed explicitly, rather than each module reading
 * `process.cwd()` itself, so commands that touch the filesystem (`init`
 * writing `installerer.kdl`; later, `validate`/`generate`/`doctor` reading a
 * `--config` path) stay testable against a real temporary directory without
 * mutating the process-wide working directory.
 */
export type CliCommandModule = {
  readonly name: string;
  run(args: readonly string[], cwd: string): CliDispatchResult;
};
