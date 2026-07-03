import type { CliHelpFrame } from "./help";
import { renderHelpText } from "./help";

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
};

export const topLevelHelpText = renderHelpText(topLevelHelpFrame);
