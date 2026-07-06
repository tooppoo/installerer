/**
 * Single source of truth for standard curl install command text (issue
 * #110). Both the generated installer's `usage()` (see
 * `generatedInstaller/sections/cli.ts`) and the Web UI (`apps/web`) derive
 * their command text from this module so the two surfaces cannot drift
 * into separate wordings for the same command.
 *
 * The standard curl command assumes `install.sh` is committed at
 * `/install.sh` on the `main` branch (issue #110 scopes configurable
 * branch/path out; do not add config fields for it here).
 */
const INSTALLER_BRANCH = "main";
const INSTALLER_PATH = "/install.sh";
const EXAMPLE_PINNED_VERSION = "v0.1.2";

export type InstallCommandExamples = {
  /** Raw GitHub URL the standard curl command downloads/pipes from. */
  rawInstallerUrl: string;
  /** The single standard `curl -fsSL ... | sh` command. */
  standardCurlCommand: string;
  /** Pinned-version curl example, passing installer arguments via `sh -s --`. */
  pinnedVersionCurlCommand: string;
  /** Custom install-dir curl example, passing installer arguments via `sh -s --`. */
  installDirCurlCommand: string;
  /** Download-then-inspect-then-run alternative to `curl | sh`. */
  reviewFirstCommands: string[];
  /** States the branch/path assumption behind `standardCurlCommand`. */
  standardCurlAssumption: string;
  /** Local `sh install.sh` execution examples (valid and one rejected form). */
  localCommands: {
    valid: string[];
    invalid: string[];
  };
};

export function buildInstallCommandExamples(config: {
  owner: string;
  repo: string;
}): InstallCommandExamples {
  const rawInstallerUrl = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/refs/heads/${INSTALLER_BRANCH}${INSTALLER_PATH}`;

  return {
    rawInstallerUrl,
    standardCurlCommand: `curl -fsSL ${rawInstallerUrl} | sh`,
    pinnedVersionCurlCommand: `curl -fsSL ${rawInstallerUrl} | sh -s -- --version ${EXAMPLE_PINNED_VERSION}`,
    installDirCurlCommand: `curl -fsSL ${rawInstallerUrl} | sh -s -- --install-dir "$HOME/bin"`,
    reviewFirstCommands: [
      `curl -fsSLO ${rawInstallerUrl}`,
      "sh ./install.sh --help",
      "sh ./install.sh",
    ],
    standardCurlAssumption: `Assumes install.sh is committed at ${INSTALLER_PATH} on the ${INSTALLER_BRANCH} branch.`,
    localCommands: localInstallCommandExamples(),
  };
}

export function localInstallCommandExamples() {
  return {
    valid: [
      "sh install.sh",
      `sh install.sh --version ${EXAMPLE_PINNED_VERSION}`,
      'sh install.sh --install-dir "$HOME/bin"',
      `sh install.sh --version ${EXAMPLE_PINNED_VERSION} --install-dir "$HOME/bin"`,
    ],
    invalid: ["sh install.sh --version latest"],
  };
}
