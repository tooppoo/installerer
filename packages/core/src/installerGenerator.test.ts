import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { generateInstaller, previewArchiveNames, shellLiteral } from "./installerGenerator";
import { validateInstallerConfig } from "./installerConfig";

const configInput = {
  owner: "tooppoo",
  repo: "rellog",
  binary: {
    name: "rellog",
    pathInArchive: "bin/rellog",
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
    expect(script).toContain("require_command 'curl'");
    expect(script).toContain("CHECKSUM_COMMAND='sha256sum'");
    expect(script).toContain("CHECKSUM_COMMAND='shasum'");
    expect(script).toContain('awk -v name="$archive_asset_name" \'$2 == name');
    expect(script).toContain(
      'tar -xzf "$archive_path" -C "$extract_dir" -- "$BINARY_PATH_IN_ARCHIVE"',
    );
    expect(script).toContain(
      'unzip -q "$archive_path" "$BINARY_PATH_IN_ARCHIVE" -d "$extract_dir"',
    );
    expect(script).toContain('[ ! -L "$extracted_binary" ]');
    expect(script).toContain('[ -f "$extracted_binary" ]');
    expect(script).toContain('install_tmp=$(mktemp -- "$INSTALL_DIR/.$BINARY_NAME.tmp.XXXXXX")');
    expect(script).toContain('cp -- "$extracted_binary" "$install_tmp"');
    expect(script).toContain('chmod -- 755 "$install_tmp"');
    expect(script).toContain('mv -- "$install_tmp" "$INSTALL_DIR/$BINARY_NAME"');
    expect(script).toContain("install_tmp=\n}");
    expect(script).toContain("trap cleanup EXIT");
    expect(script).toContain("trap cleanup_on_signal HUP INT TERM");
    expect(script).not.toContain("tmp.$$");
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

  test("generateInstaller rejects a config whose archive name template is invalid", () => {
    const result = validateInstallerConfig(configInput);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    // validateInstallerConfig normally rejects this earlier; the generator
    // still guards against being handed an unvalidated config directly.
    const broken = {
      ...result.config,
      archive: { ...result.config.archive, nameTemplate: "{unknown}.tar.gz" },
    };

    expect(() => generateInstaller(broken)).toThrow(
      "Unknown archive filename placeholder: {unknown}.",
    );
  });

  test("with {version}, latest install emits checksum-index resolution and never a VERSION asset", () => {
    const result = validateInstallerConfig(configInput);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const script = generateInstaller(result.config);
    expect(script).toContain("resolve_expected_release_tag()");
    expect(script).toContain("render_archive_asset_name_prefix()");
    expect(script).toContain("render_archive_asset_name_suffix()");
    expect(script).toContain(
      'resolved_version=$(resolve_expected_release_tag "$checksum_index_path" "$prefix" "$suffix") || exit 1',
    );
    expect(script).toContain("installerer: resolved latest version $resolved_version");
    expect(script).not.toContain("read_version_file");
    expect(script).not.toContain("VERSION_FILE_NAME");

    const withoutVersionResult = validateInstallerConfig({
      ...configInput,
      archive: { format: "tar.gz", nameTemplate: "{repo}_{target}.tar.gz" },
    });
    expect(withoutVersionResult.ok).toBe(true);
    if (!withoutVersionResult.ok) {
      return;
    }
    const withoutVersionScript = generateInstaller(withoutVersionResult.config);
    expect(withoutVersionScript).not.toContain("resolve_expected_release_tag");
    expect(withoutVersionScript).not.toContain("read_version_file");
    expect(withoutVersionScript).not.toContain("VERSION_FILE_NAME");
  });

  test("without {version}, latest install uses versionless latest/download URLs and logs latest as the source", () => {
    const result = validateInstallerConfig({
      ...configInput,
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
    expect(script).toContain('render_archive_asset_name "" "$os" "$asset_arch_label"');
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

  const resolveExpectedReleaseTag = (
    indexContent: string,
    prefix: string,
    suffix: string,
    decoyFileNames: string[] = [],
  ) => {
    const result = validateInstallerConfig(configInput);
    if (!result.ok) {
      throw new Error("config should be valid");
    }
    const harness = `
if out=$(resolve_expected_release_tag "$1" "$2" "$3"); then
  printf 'OK:[%s]' "$out"
else
  printf 'FAIL'
fi
`;
    const script = generateInstaller(result.config).replace('\nmain "$@"\n', `\n${harness}\n`);
    const dir = mkdtempSync(join(tmpdir(), "installerer-index-fixture-"));
    const indexPath = join(dir, "checksums_index");
    writeFileSync(indexPath, indexContent);
    // Decoy files placed in the spawned shell's own cwd (not referenced by
    // path anywhere): if the index-line split ever glob-expanded instead of
    // treating the line as literal text, one of these would wrongly appear
    // in place of the literal filename column.
    for (const decoyFileName of decoyFileNames) {
      writeFileSync(join(dir, decoyFileName), "");
    }
    try {
      return spawnSync("sh", ["-s", "--", indexPath, prefix, suffix], {
        input: script,
        encoding: "utf8",
        cwd: dir,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  test("resolve_expected_release_tag extracts the unique candidate matching prefix/suffix", () => {
    const index =
      "aaaa  rellog_v0.1.2_linux_x86_64.tar.gz\nbbbb  other_v9.9.9_linux_x86_64.tar.gz\n";
    expect(resolveExpectedReleaseTag(index, "rellog_", "_linux_x86_64.tar.gz").stdout).toBe(
      "OK:[v0.1.2]",
    );
  });

  test("resolve_expected_release_tag dedupes an identical filename repeated across lines", () => {
    const index =
      "aaaa  rellog_v0.1.2_linux_x86_64.tar.gz\naaaa  rellog_v0.1.2_linux_x86_64.tar.gz\n";
    expect(resolveExpectedReleaseTag(index, "rellog_", "_linux_x86_64.tar.gz").stdout).toBe(
      "OK:[v0.1.2]",
    );
  });

  test("resolve_expected_release_tag fails when no candidate matches", () => {
    const run = resolveExpectedReleaseTag(
      "aaaa  other_linux_x86_64.tar.gz\n",
      "rellog_",
      ".tar.gz",
    );
    expect(run.stdout).toBe("FAIL");
    expect(run.stderr).toContain("no release asset");
  });

  test("resolve_expected_release_tag fails when two distinct candidates match", () => {
    const index =
      "aaaa  rellog_v0.1.2_linux_x86_64.tar.gz\nbbbb  rellog_v0.1.3_linux_x86_64.tar.gz\n";
    const run = resolveExpectedReleaseTag(index, "rellog_", "_linux_x86_64.tar.gz");
    expect(run.stdout).toBe("FAIL");
    expect(run.stderr).toContain("ambiguous");
  });

  test("resolve_expected_release_tag rejects a candidate that is not a valid Git tag", () => {
    const run = resolveExpectedReleaseTag(
      "aaaa  rellog_..bad_linux_x86_64.tar.gz\n",
      "rellog_",
      "_linux_x86_64.tar.gz",
    );
    expect(run.stdout).toBe("FAIL");
    expect(run.stderr).toContain("not a valid Git tag");
  });

  test("resolve_expected_release_tag rejects a candidate containing a slash as filename-unsafe", () => {
    const run = resolveExpectedReleaseTag(
      "aaaa  rellog_release/v0.1.2_linux_x86_64.tar.gz\n",
      "rellog_",
      "_linux_x86_64.tar.gz",
    );
    expect(run.stdout).toBe("FAIL");
    expect(run.stderr).toContain("not safe as a filename");
  });

  test("resolve_expected_release_tag treats the index filename column as literal text, never a glob", () => {
    // A decoy file that would satisfy the same prefix/suffix if the
    // unquoted `set -- $line` split were ever allowed to glob-expand the
    // literal "*" in the index line below against this shell's cwd.
    const run = resolveExpectedReleaseTag(
      "aaaa  rellog_*_linux_x86_64.tar.gz\n",
      "rellog_",
      "_linux_x86_64.tar.gz",
      ["rellog_decoy-from-glob-expansion_linux_x86_64.tar.gz"],
    );
    // "*" is rejected by is_valid_git_tag (unsafe char), which still proves
    // the point: a real bug here would instead succeed with the decoy's
    // "decoy-from-glob-expansion", not fail on the literal "*".
    expect(run.stdout).toBe("FAIL");
    expect(run.stderr).toContain("not a valid Git tag");
    expect(run.stderr).not.toContain("decoy-from-glob-expansion");
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

  test("archive.osCase capitalized renders capitalized OS names in previews", () => {
    const result = validateInstallerConfig({
      ...configInput,
      archive: { ...configInput.archive, osCase: "capitalized" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const previews = previewArchiveNames(result.config, "v1.2.3");
    expect(previews[0]?.name).toBe("rellog_v1.2.3_Linux_x86_64.tar.gz");
  });

  const detectTarget = (
    osCase: "lowercase" | "capitalized",
    unameS: string,
    unameM: string,
    targets: Array<{ os: string; arch: string }> = configInput.targets,
  ) => {
    const result = validateInstallerConfig({
      ...configInput,
      archive: { ...configInput.archive, osCase },
      targets,
    });
    if (!result.ok) {
      throw new Error("config should be valid");
    }
    const harness = `
uname() {
  case "$1" in
    -s) printf '%s' "$UNAME_S_FIXTURE" ;;
    -m) printf '%s' "$UNAME_M_FIXTURE" ;;
  esac
}
detect_target
`;
    const script = generateInstaller(result.config).replace('\nmain "$@"\n', `\n${harness}\n`);
    return spawnSync("sh", ["-s"], {
      input: script,
      env: { ...process.env, UNAME_S_FIXTURE: unameS, UNAME_M_FIXTURE: unameM },
      encoding: "utf8",
    }).stdout;
  };

  test("detect_target reports lowercase OS names by default", () => {
    expect(detectTarget("lowercase", "Linux", "x86_64")).toBe("linux x86_64\n");
  });

  test("detect_target reports canonical lowercase OS names even when archive.osCase is capitalized", () => {
    // archive.osCase is an asset-name spelling concern; it is applied by
    // render_archive_asset_name, never by runtime target detection.
    expect(detectTarget("capitalized", "Linux", "x86_64")).toBe("linux x86_64\n");
  });

  const renderArchiveAssetName = (osCase: "lowercase" | "capitalized") => {
    const result = validateInstallerConfig({
      ...configInput,
      archive: { ...configInput.archive, osCase },
    });
    if (!result.ok) {
      throw new Error("config should be valid");
    }
    const harness = `
render_archive_asset_name "v1.2.3" "linux" "x86_64"
`;
    const script = generateInstaller(result.config).replace('\nmain "$@"\n', `\n${harness}\n`);
    return spawnSync("sh", ["-s"], {
      input: script,
      encoding: "utf8",
    }).stdout;
  };

  test("render_archive_asset_name renders the canonical OS name for lowercase osCase", () => {
    expect(renderArchiveAssetName("lowercase")).toBe("rellog_v1.2.3_linux_x86_64.tar.gz\n");
  });

  test("render_archive_asset_name capitalizes the OS name when archive.osCase is capitalized", () => {
    expect(renderArchiveAssetName("capitalized")).toBe("rellog_v1.2.3_Linux_x86_64.tar.gz\n");
  });

  test("detect_target canonicalizes both arm64 and aarch64 uname -m values to aarch64", () => {
    const targets = [{ os: "darwin", arch: "aarch64" }];
    expect(detectTarget("lowercase", "Darwin", "arm64", targets)).toBe("darwin aarch64\n");
    expect(detectTarget("lowercase", "Darwin", "aarch64", targets)).toBe("darwin aarch64\n");
  });

  const detectTargetFailure = (unameM: string) => {
    const result = validateInstallerConfig(configInput);
    if (!result.ok) {
      throw new Error("config should be valid");
    }
    const harness = `
uname() {
  case "$1" in
    -s) printf '%s' "Linux" ;;
    -m) printf '%s' "$UNAME_M_FIXTURE" ;;
  esac
}
detect_target
`;
    const script = generateInstaller(result.config).replace('\nmain "$@"\n', `\n${harness}\n`);
    return spawnSync("sh", ["-s"], {
      input: script,
      env: { ...process.env, UNAME_M_FIXTURE: unameM },
      encoding: "utf8",
    });
  };

  // amd64 is a common asset-label spelling, not a real uname -m output, and
  // must not be special-cased in runtime canonicalization.
  test.each(["amd64", "mips", "riscv64"])(
    "detect_target rejects unsupported architecture %j",
    (unameM) => {
      const result = detectTargetFailure(unameM);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`unsupported architecture: ${unameM}`);
    },
  );
});
