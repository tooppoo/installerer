import { describe, expect, test } from "bun:test";

import type { InstallerConfig } from "../installerConfig";
import { resolveRuntimeDependencies } from "./resolve";
import { renderRuntimeRequirementsText } from "./renderText";

const baseConfig: InstallerConfig = {
  owner: "tooppoo",
  repo: "rellog",
  binary: {
    name: "rellog",
    pathInArchive: "bin/rellog",
  },
  archive: {
    format: "tar.gz",
    nameTemplate: "{repo}_{version}_{os}_{arch}.tar.gz",
    osCase: "lowercase",
  },
  checksum: {
    fileName: "checksums.txt",
    algorithm: "sha256",
  },
  targets: [{ os: "linux", arch: "x86_64" }],
  architectureLabels: {
    linux: { x86_64: "x86_64", aarch64: "aarch64" },
    darwin: { x86_64: "x86_64", aarch64: "aarch64" },
  },
  defaults: {
    installDir: "$HOME/.local/bin",
  },
};

describe("renderRuntimeRequirementsText", () => {
  test("renders the premise, required commands, network, and filesystem sections in order", () => {
    const text = renderRuntimeRequirementsText(resolveRuntimeDependencies(baseConfig));

    expect(text).toStartWith("Runtime requirements for this installer:\n");
    expect(text).toContain(
      "Runtime premise:\n- POSIX-compatible sh: this installer is executed under a POSIX-compatible sh runtime",
    );
    expect(text).toContain("Required commands:\n- uname: Detects the host OS and architecture.");
    expect(text).toContain("- tar: Extracts tar.gz archives.");
    expect(text).toContain("- sha256sum or shasum: Verifies SHA-256 checksums.");
    expect(text).toContain(
      "Network:\n- HTTPS access to GitHub release assets: downloads the archive and checksum file from GitHub Releases",
    );
    expect(text).toContain(
      "Filesystem:\n- Write permission to the install directory: the installer writes the binary into the install directory",
    );
    expect(text).toEndWith("\n");
    expect(text).not.toEndWith("\n\n");
  });

  test("swaps in unzip for zip archives", () => {
    const text = renderRuntimeRequirementsText(
      resolveRuntimeDependencies({
        ...baseConfig,
        archive: { ...baseConfig.archive, format: "zip" },
      }),
    );
    expect(text).toContain("- unzip: Extracts zip archives.");
    expect(text).not.toContain("tar.gz");
  });
});
