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

  test("release_version_file latest install resolves and logs the version, latest_asset does not", () => {
    const result = validateInstallerConfig(configInput);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const script = generateInstaller(result.config);
    expect(script).toContain("read_version_file()");
    expect(script).toContain("VERSION file must contain a single line");
    expect(script).toContain("VERSION file is empty");
    expect(script).toContain('resolved_version=$(read_version_file "$version_file_url") || exit 1');
    expect(script).toContain("installerer: resolved latest version $resolved_version");

    const latestAssetResult = validateInstallerConfig({
      ...configInput,
      versionResolver: { type: "latest_asset" },
      archive: { format: "tar.gz", nameTemplate: "{repo}_{target}.tar.gz" },
    });
    expect(latestAssetResult.ok).toBe(true);
    if (!latestAssetResult.ok) {
      return;
    }
    const latestAssetScript = generateInstaller(latestAssetResult.config);
    expect(latestAssetScript).not.toContain("read_version_file");
    expect(latestAssetScript).not.toContain("VERSION_FILE_NAME");
  });

  test("latest_asset latest install uses versionless latest/download URLs and logs latest as the source", () => {
    const result = validateInstallerConfig({
      ...configInput,
      versionResolver: { type: "latest_asset" },
      archive: { format: "tar.gz", nameTemplate: "{repo}_{target}.tar.gz" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const script = generateInstaller(result.config);

    // latest install fetches versionless assets directly from latest/download.
    expect(script).toContain(
      'archive_url="https://github.com/$owner_path/$repo_path/releases/latest/download/$archive_path_segment"',
    );
    expect(script).toContain(
      'checksum_url="https://github.com/$owner_path/$repo_path/releases/latest/download/$checksum_path_segment"',
    );
    // The archive name is rendered from a versionless template (empty version).
    expect(script).toContain('render_archive_asset_name "" "$os" "$arch"');
    // Install source is logged as latest; the resolved release tag is not.
    expect(script).toContain("installerer: install source latest");
    expect(script).not.toContain("resolved latest version");
    // pinned install still uses the release-tag download path.
    expect(script).toContain(
      'archive_url="https://github.com/$owner_path/$repo_path/releases/download/$version_path/$archive_path_segment"',
    );
    // No GitHub API access and no VERSION asset handling.
    expect(script).not.toContain("api.github.com");
    expect(script).not.toContain("VERSION_FILE_NAME");
  });

  const readVersionFile = (fixture: string) => {
    const result = validateInstallerConfig(configInput);
    if (!result.ok) {
      throw new Error("config should be valid");
    }
    const harness = `
curl() { printf '%s' "$VERSION_FIXTURE"; }
if out=$(read_version_file "https://example.com/VERSION"); then
  printf 'OK:[%s]' "$out"
else
  printf 'FAIL'
fi
`;
    const script = generateInstaller(result.config).replace('\nmain "$@"\n', `\n${harness}\n`);
    return spawnSync("sh", ["-s"], {
      input: script,
      env: { ...process.env, VERSION_FIXTURE: fixture },
      encoding: "utf8",
    });
  };

  test("read_version_file strips a single trailing LF or CRLF without trimming whitespace", () => {
    expect(readVersionFile("v0.1.2\n").stdout).toBe("OK:[v0.1.2]");
    expect(readVersionFile("v0.1.2\r\n").stdout).toBe("OK:[v0.1.2]");
    expect(readVersionFile("v0.1.2").stdout).toBe("OK:[v0.1.2]");
    // Leading/trailing whitespace is preserved, not auto-trimmed.
    expect(readVersionFile(" v0.1.2 \n").stdout).toBe("OK:[ v0.1.2 ]");
  });

  test("read_version_file rejects empty and multiple-line VERSION content", () => {
    const emptyRun = readVersionFile("");
    expect(emptyRun.stdout).toBe("FAIL");
    expect(emptyRun.stderr).toContain("VERSION file is empty");

    const onlyNewlineRun = readVersionFile("\n");
    expect(onlyNewlineRun.stdout).toBe("FAIL");
    expect(onlyNewlineRun.stderr).toContain("VERSION file is empty");

    const multiLineRun = readVersionFile("v0.1.2\nextra\n");
    expect(multiLineRun.stdout).toBe("FAIL");
    expect(multiLineRun.stderr).toContain("VERSION file must contain a single line");

    const embeddedCrRun = readVersionFile("v0.1.2\rextra\n");
    expect(embeddedCrRun.stdout).toBe("FAIL");
    expect(embeddedCrRun.stderr).toContain("VERSION file must contain a single line");
  });

  const urlEncodeSegment = (value: string) => {
    const result = validateInstallerConfig(configInput);
    if (!result.ok) {
      throw new Error("config should be valid");
    }
    const harness = `printf '%s' "$(url_encode_segment "$ENCODE_FIXTURE")"`;
    const script = generateInstaller(result.config).replace('\nmain "$@"\n', `\n${harness}\n`);
    return spawnSync("sh", ["-s"], {
      input: script,
      env: { ...process.env, ENCODE_FIXTURE: value },
      encoding: "utf8",
    });
  };

  test("url_encode_segment preserves unreserved bytes and encodes the rest under set -u", () => {
    // Underscores are unreserved and must survive verbatim, even under `set -u`.
    const underscore = urlEncodeSegment("rellog_linux_x86_64.tar.gz");
    expect(underscore.status).toBe(0);
    expect(underscore.stderr).toBe("");
    expect(underscore.stdout).toBe("rellog_linux_x86_64.tar.gz");

    // Other unreserved characters pass through; reserved ones are percent-encoded.
    const unreserved = urlEncodeSegment("a-b.c~d");
    expect(unreserved.status).toBe(0);
    expect(unreserved.stdout).toBe("a-b.c~d");

    const slash = urlEncodeSegment("release/v1.2.3");
    expect(slash.status).toBe(0);
    expect(slash.stdout).toBe("release%2Fv1.2.3");

    const space = urlEncodeSegment("a b");
    expect(space.status).toBe(0);
    expect(space.stdout).toBe("a%20b");
  });
    // Other unreserved characters pass through; reserved ones are percent-encoded.
    expect(urlEncodeSegment("a-b.c~d").stdout).toBe("a-b.c~d");
    expect(urlEncodeSegment("release/v1.2.3").stdout).toBe("release%2Fv1.2.3");
    expect(urlEncodeSegment("a b").stdout).toBe("a%20b");
  });

  const isValidGitTag = (tag: string) => {
    const result = validateInstallerConfig(configInput);
    if (!result.ok) {
      throw new Error("config should be valid");
    }
    const harness = `
if is_valid_git_tag "$TAG_FIXTURE"; then
  printf 'VALID'
else
  printf 'INVALID'
fi
`;
    const script = generateInstaller(result.config).replace('\nmain "$@"\n', `\n${harness}\n`);
    return spawnSync("sh", ["-s"], {
      input: script,
      env: { ...process.env, TAG_FIXTURE: tag },
      encoding: "utf8",
    }).stdout;
  };

  test("is_valid_git_tag rejects whitespace, control chars, and latest", () => {
    expect(isValidGitTag("v0.1.2")).toBe("VALID");
    expect(isValidGitTag("release/v1.2.3")).toBe("VALID");
    expect(isValidGitTag("v0.1.2 ")).toBe("INVALID");
    expect(isValidGitTag(" v0.1.2")).toBe("INVALID");
    expect(isValidGitTag("v0 1.2")).toBe("INVALID");
    expect(isValidGitTag("v0.1.2\t")).toBe("INVALID");
    expect(isValidGitTag("latest")).toBe("INVALID");
    expect(isValidGitTag("")).toBe("INVALID");
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
