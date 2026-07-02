import { expect } from "bun:test";
import type { ArchiveFormat } from "../../src/archiveTemplate";

export type GeneratedInstallerExpectation = {
  archiveFormat: ArchiveFormat;
  resolverType: "release_version_file" | "latest_asset";
};

/**
 * Static assertions over the emitted installer text. These are intentionally
 * string/regex scans of the generator's known output structure — not general
 * shell parsing — so they stay machine-checkable where snapshot review alone
 * could miss a forbidden construct (issue #10).
 */
export function assertGeneratedInstallerContract(
  script: string,
  expectation: GeneratedInstallerExpectation,
): void {
  assertForbiddenConstructsAbsent(script);
  assertNetworkBoundary(script);
  assertRuntimeStructure(script);
  assertChecksumVerification(script);
  assertRemoteLocalSeparation(script);
  assertArchiveFormat(script, expectation.archiveFormat);
  assertResolver(script, expectation.resolverType);
}

function assertForbiddenConstructsAbsent(script: string): void {
  // eval as a shell word, not substrings such as "retrieval".
  expect(script).not.toMatch(/\beval\b/);
  // The MVP verifies checksums only; cosign must not be emitted.
  expect(script).not.toMatch(/cosign/i);
  expect(script).not.toMatch(/\bfetch\s*\(/);
  expect(script).not.toMatch(/\bXMLHttpRequest\b/);
}

function assertNetworkBoundary(script: string): void {
  expect(script).not.toContain("api.github.com");
  expect(script).not.toContain("raw.githubusercontent.com");
  expect(script).not.toContain("gist.githubusercontent.com");

  // Allowlist, not blanket URL rejection: every URL literal or URL
  // construction fragment must target GitHub Release asset downloads.
  const urls = script.match(/https?:\/\/[^\s"']+/g) ?? [];
  expect(urls.length).toBeGreaterThan(0);
  for (const url of urls) {
    expect(url).toStartWith("https://github.com/");
    expect(url).toMatch(/\/releases\/(latest\/download|download)\//);
  }

  // Every scheme occurrence must have been captured by the URL scan above,
  // so no second URL construction path can hide behind string assembly.
  expect(script.split("://").length - 1).toBe(urls.length);
}

function assertRuntimeStructure(script: string): void {
  expect(script).toStartWith("#!/bin/sh");
  expect(script.trimEnd()).toEndWith('main "$@"');
  expect(script).toContain("\nmain() {");
  expect(script).toContain("\ninstall_latest() {");
  expect(script).toContain("\ninstall_pin() {");

  // main owns dispatch: --version present -> install_pin, absent -> install_latest.
  expect(script).toContain(
    `  if [ -n "$version" ]; then
    install_pin "$version"
  else
    install_latest
  fi`,
  );

  // --version latest is rejected as exact lowercase "latest"; other casings
  // fall through to ordinary Git tag validation instead of the special case.
  expect(script).toContain('[ "$version" != "latest" ] || fail');
  expect(script).not.toContain("Latest");
  expect(script).not.toContain("LATEST");

  // Missing runtime dependencies stop with a clear error.
  expect(script).toContain('command -v "$1" >/dev/null 2>&1 || fail "$1 is required"');
  expect(script).toContain("require_command curl");
  expect(script).toContain('fail "sha256sum or shasum is required"');
}

function assertChecksumVerification(script: string): void {
  // Lookup is exact string equality on the raw asset name — never a regex,
  // glob, or the URL-encoded path segment.
  expect(script).toContain('awk -v name="$archive_asset_name" \'$2 == name');
  expect(script).not.toContain('name="$archive_path_segment"');
  expect(script).not.toMatch(/grep[^\n]*checksum/);

  expect(script).toContain("sha256sum -c");
  expect(script).toContain("shasum -a 256");
  expect(script).toContain('fail "archive checksum mismatch"');
}

function assertRemoteLocalSeparation(script: string): void {
  // Downloads land on fixed local names; the remote asset name never becomes
  // part of a local path.
  expect(script).toContain('archive_path="$tmpdir/archive"');
  expect(script).toContain('checksum_path="$tmpdir/checksums"');
  expect(script).not.toContain("$tmpdir/$archive_asset_name");
  expect(script).not.toMatch(/\$tmpdir[^\n]*\$archive_asset_name/);
  expect(script).not.toMatch(/\$archive_asset_name[^\n]*\$tmpdir/);

  // The remote asset name is never a bare command operand: every expansion
  // must sit inside a double-quoted region. The generated script does not
  // escape double quotes, so an odd quote count before the expansion means
  // it is quoted.
  for (const line of script.split("\n")) {
    let index = line.indexOf("$archive_asset_name");
    while (index !== -1) {
      const quotesBefore = (line.slice(0, index).match(/"/g) ?? []).length;
      if (quotesBefore % 2 !== 1) {
        throw new Error(`Unquoted $archive_asset_name expansion in generated line: ${line}`);
      }
      index = line.indexOf("$archive_asset_name", index + 1);
    }
  }
}

function assertArchiveFormat(script: string, format: ArchiveFormat): void {
  expect(script).toContain(`ARCHIVE_FORMAT='${format}'`);

  // Both extraction paths are emitted behind the ARCHIVE_FORMAT dispatch,
  // with the format-specific dependency check.
  expect(script).toContain("tar.gz) require_command tar ;;");
  expect(script).toContain("zip) require_command unzip ;;");
  expect(script).toContain(
    'tar -xzf "$archive_path" -C "$extract_dir" -- "$BINARY_PATH_IN_ARCHIVE"',
  );
  expect(script).toContain('unzip -q "$archive_path" "$BINARY_PATH_IN_ARCHIVE" -d "$extract_dir"');
}

function assertResolver(
  script: string,
  resolverType: GeneratedInstallerExpectation["resolverType"],
): void {
  // Pinned installs always download from the encoded release tag path.
  expect(script).toContain(
    'archive_url="https://github.com/$owner_path/$repo_path/releases/download/$version_path/$archive_path_segment"',
  );

  if (resolverType === "release_version_file") {
    expect(script).toContain("read_version_file() {");
    expect(script).toContain("VERSION_FILE_NAME=");
    expect(script).toContain(
      'version_file_url="https://github.com/$owner_path/$repo_path/releases/latest/download/$version_file_path"',
    );
    expect(script).toContain('resolved_version=$(read_version_file "$version_file_url")');
    return;
  }

  // latest_asset: no VERSION asset handling, latest downloads are versionless.
  expect(script).not.toContain("read_version_file");
  expect(script).not.toContain("VERSION_FILE_NAME");
  expect(script).toContain(
    'archive_url="https://github.com/$owner_path/$repo_path/releases/latest/download/$archive_path_segment"',
  );
}
