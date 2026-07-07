import { buildInstallCommandExamples } from "@installerer/core/installCommandExamples";

import type { CliHelpFrame } from "./help";
import { renderHelpText } from "./help";

/**
 * The top-level `--help` has no loaded config yet (`generate`/`validate`/
 * `doctor` aren't wired up until #88-#91), so these curl install examples
 * use literal `<owner>`/`<repo>` placeholders rather than a real
 * repository. Once a command loads an `InstallerConfig`, replace this
 * placeholder pair with that command's actual `config.owner`/`config.repo`
 * instead of keeping a generic top-level example.
 */
const PLACEHOLDER_OWNER = "<owner>";
const PLACEHOLDER_REPO = "<repo>";
const curlInstallExamples = buildInstallCommandExamples({
  owner: PLACEHOLDER_OWNER,
  repo: PLACEHOLDER_REPO,
});

/**
 * Only generator-only commands are listed here. Package-installer-like
 * commands (`install`, `run`, `exec`, `upgrade`, `uninstall`) must not
 * appear, per the CLI distribution policy (docs/adr/20260703T091000Z).
 */
export const topLevelHelpFrame: CliHelpFrame = {
  abstraction: "installerer generates a self-contained install.sh from a JSON config.",
  usage: ["installerer <command> [options]"],
  commands: [
    "installerer init",
    "installerer validate --config installerer.json",
    "installerer generate --config installerer.json --out install.sh",
    "installerer doctor --config installerer.json",
    "installerer --version",
    "installerer --help",
  ],
  options: ["-h, --help", "-v, --version"],
  examples: [
    curlInstallExamples.standardCurlCommand,
    curlInstallExamples.standardCurlAssumption,
    curlInstallExamples.pinnedVersionCurlCommand,
    curlInstallExamples.installDirCurlCommand,
    ...curlInstallExamples.reviewFirstCommands,
  ],
};

export const topLevelHelpText = renderHelpText(topLevelHelpFrame);
