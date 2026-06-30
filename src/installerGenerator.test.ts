import { describe, expect, test } from "bun:test";

import { generateInstaller, previewArchiveNames, shellLiteral } from "./installerGenerator";
import { validateInstallerConfig } from "./installerConfig";

const configInput = {
  owner: "tooppoo",
  repo: "rellog",
  binary: {
    name: "rellog",
    pathInArchive: "bin/rellog",
  },
  versionResolver: {
    type: "release_version_file",
    fileName: "VERSION",
  },
  archive: {
    format: "tar.gz",
    nameTemplate: "{repo}_{version}_{target}.tar.gz",
  },
  checksum: {
    fileName: "checksums.txt",
    algorithm: "sha256",
  },
  targets: [{ os: "linux", arch: "x86_64" }],
};

describe("installer generation", () => {
  test("generates a single install.sh with mode-specific functions and no eval", () => {
    const result = validateInstallerConfig(configInput);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const script = generateInstaller(result.config);

    expect(script).toStartWith("#!/bin/sh");
    expect(script).toContain("main()");
    expect(script).toContain("install_latest()");
    expect(script).toContain("install_pin()");
    expect(script).toContain("download_and_install()");
    expect(script).toContain("printf '%s' \"$REPO\" '_' \"$version\" '_' \"$target\" '.tar.gz'");
    expect(script).toContain("--version latest is ambiguous");
    expect(script).toContain('archive_path="$tmpdir/archive"');
    expect(script).not.toContain("eval");
    expect(script).not.toContain("$tmpdir/$archive_asset_name");
  });

  test("shell-escapes JSON input literals", () => {
    expect(shellLiteral("foo'bar")).toBe("'foo'\\''bar'");
  });

  test("previews runtime-expanded archive names and flags unsafe version filenames before download", () => {
    const result = validateInstallerConfig(configInput);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const previews = previewArchiveNames(result.config, "release/v1.2.3");

    expect(previews[0]?.name).toBe("rellog_release/v1.2.3_linux_x86_64.tar.gz");
    expect(previews[0]?.validation.errors[0]?.reason).toContain("path separators");
  });
});
