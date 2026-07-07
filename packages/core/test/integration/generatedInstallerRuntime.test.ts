import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { arch, platform, tmpdir } from "node:os";
import { join } from "node:path";

import { parseInstallerConfig } from "../../src/installerConfig";
import { generateInstaller } from "../../src/installerGenerator";
import { loadValidFixtures } from "../helpers/fixtures";

/**
 * Runs the generated installer as a real `sh` process with a stub `curl` on
 * PATH, so dispatch, URL construction, and failure handling are observable
 * without any network access. This stays within the MVP boundary: no fixture
 * HTTP server and no real GitHub Release.
 */

const HOST_OS = platform() === "linux" ? "linux" : platform() === "darwin" ? "darwin" : null;
const HOST_ARCH = arch() === "x64" ? "x86_64" : arch() === "arm64" ? "aarch64" : null;
const hostTargetSupported = HOST_OS !== null && HOST_ARCH !== null;

/**
 * `with-version-tar-gz`'s architectureLabels mapping, mirrored here so tests
 * can compute the exact asset filename a checksum-index row must contain to
 * match the real host target (see that fixture's architectureLabels).
 */
const ARCH_LABELS: Record<string, Record<string, string>> = {
  linux: { x86_64: "x64", aarch64: "arm64-v8a" },
  darwin: { x86_64: "amd64", aarch64: "arm64" },
};
const hostAssetArchLabel =
  HOST_OS !== null && HOST_ARCH !== null ? ARCH_LABELS[HOST_OS]?.[HOST_ARCH] : undefined;

const CURL_STUB = `#!/bin/sh
# Test stub: records the requested URL, serves an INDEX_URL fixture (writing
# to -o's output path, like real curl, since curl_download always uses -o),
# fails every other download (matching a real fetch of an unstubbed URL).
url=
output=
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) output=$2; shift 2 ;;
    -*) shift ;;
    *) url=$1; shift ;;
  esac
done
printf '%s\\n' "$url" >> "$CURL_LOG"
if [ -n "$INDEX_URL" ] && [ "$url" = "$INDEX_URL" ]; then
  if [ -n "$output" ]; then
    printf '%s\\n' "$INDEX_FIXTURE" > "$output"
  else
    printf '%s\\n' "$INDEX_FIXTURE"
  fi
  exit 0
fi
exit 1
`;

let stubDir: string;
let runCounter = 0;

beforeAll(() => {
  stubDir = mkdtempSync(join(tmpdir(), "installerer-curl-stub-"));
  const stubPath = join(stubDir, "curl");
  writeFileSync(stubPath, CURL_STUB);
  chmodSync(stubPath, 0o755);
});

afterAll(() => {
  rmSync(stubDir, { recursive: true, force: true });
});

function generateFromFixture(fixtureName: string): string {
  const fixture = loadValidFixtures().find((entry) => entry.name === fixtureName);
  if (!fixture) {
    throw new Error(`Missing valid fixture: ${fixtureName}`);
  }
  const result = parseInstallerConfig(fixture.json);
  if (!result.ok) {
    throw new Error(`Fixture ${fixtureName} should be valid`);
  }
  return generateInstaller(result.config);
}

function runInstaller(script: string, args: string[], index?: { url: string; fixture: string }) {
  runCounter += 1;
  const curlLog = join(stubDir, `curl-${runCounter}.log`);
  const run = spawnSync("sh", ["-s", "--", ...args], {
    input: script,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${stubDir}:${process.env.PATH ?? ""}`,
      CURL_LOG: curlLog,
      INDEX_URL: index?.url ?? "",
      INDEX_FIXTURE: index?.fixture ?? "",
      HOME: join(stubDir, "home"),
    },
  });
  const requestedUrls = existsSync(curlLog)
    ? readFileSync(curlLog, "utf8").split("\n").filter(Boolean)
    : [];
  return { ...run, requestedUrls };
}

describe("generated installer runtime dispatch", () => {
  test("rejects --version latest before any dispatch or network access", () => {
    const script = generateFromFixture("without-version-tar-gz");
    const run = runInstaller(script, ["--version", "latest"]);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("--version latest is ambiguous");
    expect(run.requestedUrls).toEqual([]);
  });

  test("the latest rejection is exact lowercase; Latest flows into ordinary pin handling", () => {
    const script = generateFromFixture("without-version-tar-gz");
    const run = runInstaller(script, ["--version", "Latest"]);

    expect(run.stderr).not.toContain("ambiguous");
    if (!hostTargetSupported) {
      return;
    }
    // "Latest" is a syntactically valid Git tag, so install_pin proceeds to
    // the encoded release-tag download URL and fails only at the stub curl.
    // The checksum file is requested before the archive.
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("failed to download checksum file");
    expect(run.requestedUrls[0]).toBe(
      "https://github.com/tooppoo/rellog/releases/download/Latest/checksums.txt",
    );
  });

  test.skipIf(!hostTargetSupported)(
    "without {version}, install_latest downloads versionless latest assets directly",
    () => {
      const script = generateFromFixture("without-version-tar-gz");
      const run = runInstaller(script, []);

      expect(run.status).toBe(1);
      expect(run.stdout).toContain("installerer: install source latest");
      expect(run.stderr).toContain("failed to download checksum file");
      expect(run.requestedUrls).toEqual([
        "https://github.com/tooppoo/rellog/releases/latest/download/checksums.txt",
      ]);
    },
  );

  test.skipIf(!hostTargetSupported)(
    "without {version}, pin encodes the release tag as a URL path segment",
    () => {
      const script = generateFromFixture("without-version-tar-gz");
      const run = runInstaller(script, ["--version", "release/v1.2.3"]);

      expect(run.status).toBe(1);
      expect(run.requestedUrls[0]).toBe(
        "https://github.com/tooppoo/rellog/releases/download/release%2Fv1.2.3/checksums.txt",
      );
    },
  );

  test.skipIf(!hostTargetSupported)(
    "with {version}, latest resolves the tag from a checksum-index scan, then downloads from the resolved tag",
    () => {
      const script = generateFromFixture("with-version-tar-gz");
      const assetName = `rellog_v9.9.9_${HOST_OS}_${hostAssetArchLabel}.tar.gz`;
      const indexUrl = "https://github.com/tooppoo/rellog/releases/latest/download/checksums.txt";
      const run = runInstaller(script, [], {
        url: indexUrl,
        fixture: `${"0".repeat(64)}  ${assetName}`,
      });

      expect(run.status).toBe(1);
      expect(run.stdout).toContain("installerer: resolved latest version v9.9.9");
      expect(run.stderr).toContain("failed to download checksum file");
      expect(run.requestedUrls).toEqual([
        indexUrl,
        "https://github.com/tooppoo/rellog/releases/download/v9.9.9/checksums.txt",
      ]);
    },
  );

  test.skipIf(!hostTargetSupported)(
    "with {version}, pin skips checksum-index resolution and uses the pinned tag",
    () => {
      const script = generateFromFixture("with-version-tar-gz");
      const run = runInstaller(script, ["--version", "v1.2.3"]);

      expect(run.status).toBe(1);
      expect(run.stdout).not.toContain("resolved latest version");
      expect(run.requestedUrls).toEqual([
        "https://github.com/tooppoo/rellog/releases/download/v1.2.3/checksums.txt",
      ]);
    },
  );

  test("rejects a pinned version that is not a valid Git tag", () => {
    const script = generateFromFixture("with-version-tar-gz");
    const run = runInstaller(script, ["--version", "v1 .2"]);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("--version must be a valid Git tag");
    expect(run.requestedUrls).toEqual([]);
  });
});
