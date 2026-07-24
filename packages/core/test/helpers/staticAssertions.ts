import { expect } from "bun:test";
import type { ArchiveFormat } from "../../src/archiveTemplate";

export type GeneratedInstallerExpectation = {
  archiveFormat: ArchiveFormat;
  hasVersionPlaceholder: boolean;
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
  assertVersionFlow(script, expectation.hasVersionPlaceholder);
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

  // The leading disclaimer is a human-readable comment block, not executable
  // shell: it links to the project's homepage, which is not a release asset
  // download URL. Exclude comment lines from the allowlist scan below so the
  // boundary check stays scoped to network access the script can actually
  // perform.
  const codeLines = script
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");

  // Allowlist, not blanket URL rejection: every URL literal or URL
  // construction fragment must target GitHub Release asset downloads.
  const urls = codeLines.match(/https?:\/\/[^\s"']+/g) ?? [];
  expect(urls.length).toBeGreaterThan(0);
  for (const url of urls) {
    expect(url).toStartWith("https://github.com/");
    expect(url).toMatch(/\/releases\/(latest\/download|download)\//);
  }

  // Every scheme occurrence must have been captured by the URL scan above,
  // so no second URL construction path can hide behind string assembly.
  expect(codeLines.split("://").length - 1).toBe(urls.length);
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
  // Configured asset names (e.g. a LATEST_VERSION version file) legitimately
  // contain these strings, so config assignment lines and the human-readable
  // effective-config comment block are excluded and the guard applies to the
  // runtime logic lines only.
  expect(script).toContain('[ "$version" != "latest" ] || fail');
  const logicLines = script
    .split("\n")
    .filter((line) => !/^[A-Z_]+='/.test(line))
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  expect(logicLines).not.toContain("Latest");
  expect(logicLines).not.toContain("LATEST");

  // Missing runtime dependencies stop with a clear error.
  expect(script).toContain('command -v "$1" >/dev/null 2>&1 || fail "$1 is required"');
  expect(script).toContain("require_command 'curl'");
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

  // A malformed expected checksum is its own error class, and the rejected
  // value — Release content — never reaches the message (issue #43).
  expect(script).toContain(
    'fail "malformed checksum for $archive_asset_name: expected 64 hexadecimal characters"',
  );

  // Expected-checksum resolution sits between the two downloads, so a checksum
  // file that cannot verify anything fails before the archive is transferred.
  expect(script).toContain(
    `  curl_download "$checksum_url" "$checksum_path" "checksum file"
  resolve_expected_checksum
  curl_download "$archive_url" "$archive_path" "archive"
  verify_sha256`,
  );

  // Both backends compare against the same normalized value, so an uppercase
  // checksum file cannot be accepted by one and rejected by the other.
  expect(script).toContain(
    `expected_checksum=$(printf '%s' "$expected_checksum" | tr 'ABCDEF' 'abcdef')`,
  );
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
  expect(script).toContain("tar.gz) require_command 'tar' ;;");
  expect(script).toContain("zip) require_command 'unzip' ;;");
  expect(script).toContain(
    'tar -xzf "$archive_path" -C "$extract_dir" -- "$BINARY_PATH_IN_ARCHIVE"',
  );
  expect(script).toContain('unzip -q "$archive_path" "$BINARY_PATH_IN_ARCHIVE" -d "$extract_dir"');
}

function assertVersionFlow(script: string, hasVersionPlaceholder: boolean): void {
  // Pinned installs always download from the encoded release tag path.
  expect(script).toContain(
    'archive_url="https://github.com/$owner_path/$repo_path/releases/download/$version_path/$archive_path_segment"',
  );

  // The VERSION asset concept is gone entirely (issue #111): no config or
  // template shape emits a version file fetch anymore.
  expect(script).not.toContain("read_version_file");
  expect(script).not.toContain("VERSION_FILE_NAME");

  if (hasVersionPlaceholder) {
    expect(script).toContain("resolve_expected_release_tag() {");
    expect(script).toContain("render_archive_asset_name_prefix() {");
    expect(script).toContain("render_archive_asset_name_suffix() {");
    expect(script).toContain(
      'checksum_index_url="https://github.com/$owner_path/$repo_path/releases/latest/download/$checksum_index_path_segment"',
    );
    expect(script).toContain(
      'resolved_version=$(resolve_expected_release_tag "$checksum_index_path" "$prefix" "$suffix")',
    );
    // The checksum-index scan and the final verification never merge into
    // one shared local path — they can legitimately come from two different
    // releases if the latest release changes mid-install.
    expect(script).toContain('checksum_index_path="$tmpdir/checksums_index"');
    return;
  }

  expect(script).not.toContain("resolve_expected_release_tag");
  expect(script).toContain(
    'archive_url="https://github.com/$owner_path/$repo_path/releases/latest/download/$archive_path_segment"',
  );
}
