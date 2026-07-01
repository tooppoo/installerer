import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

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
    expect(script).toContain("--install-dir");
    expect(script).toContain("--help");
    expect(script).toContain('archive_path="$tmpdir/archive"');
    expect(script).not.toContain("eval");
    expect(script).not.toContain("$tmpdir/$archive_asset_name");
  });

  test("generates hardened download, extraction, checksum, and placement runtime", () => {
    const result = validateInstallerConfig(configInput);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const script = generateInstaller(result.config);

    expect(script).toContain("check_runtime_dependencies()");
    expect(script).toContain("require_command curl");
    expect(script).toContain("CHECKSUM_COMMAND=sha256sum");
    expect(script).toContain("CHECKSUM_COMMAND=shasum");
    expect(script).toContain('awk -v name="$archive_asset_name" \'$2 == name');
    expect(script).toContain(
      'tar -xzf "$archive_path" -C "$extract_dir" -- "$BINARY_PATH_IN_ARCHIVE"',
    );
    expect(script).toContain(
      'unzip -q "$archive_path" "$BINARY_PATH_IN_ARCHIVE" -d "$extract_dir"',
    );
    expect(script).toContain('[ ! -L "$extracted_binary" ]');
    expect(script).toContain('[ -f "$extracted_binary" ]');
    expect(script).toContain('install_tmp="$INSTALL_DIR/.$BINARY_NAME.tmp.$$"');
    expect(script).toContain('cp "$extracted_binary" "$install_tmp"');
    expect(script).toContain('chmod +x "$install_tmp"');
    expect(script).toContain('mv "$install_tmp" "$INSTALL_DIR/$BINARY_NAME"');
    expect(script).toContain("https://github.com/$owner_path/$repo_path/releases/download/");
    expect(script).not.toContain("api.github.com");
  });

  test("generated runtime expands default and tilde install directories without eval", () => {
    const result = validateInstallerConfig(configInput);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const script = generateInstaller(result.config).replace(
      '\nmain "$@"\n',
      '\nprintf "%s\\n" "$(resolve_install_dir "$1")"\n',
    );
    const shell = spawnSync("sh", ["-s", "~/bin"], {
      input: script,
      env: { ...process.env, HOME: "/tmp/installerer-home" },
      encoding: "utf8",
    });

    expect(shell.status).toBe(0);
    expect(shell.stderr).toBe("");
    expect(shell.stdout).toBe("/tmp/installerer-home/bin\n");
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
