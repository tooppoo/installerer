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
const HOST_ARCH = arch() === "x64" ? "x86_64" : arch() === "arm64" ? "arm64" : null;
const hostTargetSupported = HOST_OS !== null && HOST_ARCH !== null;

const CURL_STUB = `#!/bin/sh
# Test stub: records the requested URL, serves VERSION fixtures, fails downloads.
url=
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) shift 2 ;;
    -*) shift ;;
    *) url=$1; shift ;;
  esac
done
printf '%s\\n' "$url" >> "$CURL_LOG"
case "$url" in
  */VERSION) printf '%s\\n' "$VERSION_FIXTURE" ; exit 0 ;;
esac
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

function runInstaller(script: string, args: string[], versionFixture = "v9.9.9") {
  runCounter += 1;
  const curlLog = join(stubDir, `curl-${runCounter}.log`);
  const run = spawnSync("sh", ["-s", "--", ...args], {
    input: script,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${stubDir}:${process.env.PATH ?? ""}`,
      CURL_LOG: curlLog,
      VERSION_FIXTURE: versionFixture,
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
    const script = generateFromFixture("latest-asset-tar-gz");
    const run = runInstaller(script, ["--version", "latest"]);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("--version latest is ambiguous");
    expect(run.requestedUrls).toEqual([]);
  });

  test("the latest rejection is exact lowercase; Latest flows into ordinary pin handling", () => {
    const script = generateFromFixture("latest-asset-tar-gz");
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
    "latest_asset dispatches to install_latest and downloads versionless latest assets",
    () => {
      const script = generateFromFixture("latest-asset-tar-gz");
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
    "latest_asset pin encodes the release tag as a URL path segment",
    () => {
      const script = generateFromFixture("latest-asset-tar-gz");
      const run = runInstaller(script, ["--version", "release/v1.2.3"]);

      expect(run.status).toBe(1);
      expect(run.requestedUrls[0]).toBe(
        "https://github.com/tooppoo/rellog/releases/download/release%2Fv1.2.3/checksums.txt",
      );
    },
  );

  test.skipIf(!hostTargetSupported)(
    "release_version_file latest resolves the VERSION asset, then downloads from the resolved tag",
    () => {
      const script = generateFromFixture("release-version-file-tar-gz");
      const run = runInstaller(script, [], "v9.9.9");

      expect(run.status).toBe(1);
      expect(run.stdout).toContain("installerer: resolved latest version v9.9.9");
      expect(run.stderr).toContain("failed to download checksum file");
      expect(run.requestedUrls).toEqual([
        "https://github.com/tooppoo/rellog/releases/latest/download/VERSION",
        "https://github.com/tooppoo/rellog/releases/download/v9.9.9/checksums.txt",
      ]);
    },
  );

  test.skipIf(!hostTargetSupported)(
    "release_version_file pin skips VERSION resolution and uses the pinned tag",
    () => {
      const script = generateFromFixture("release-version-file-tar-gz");
      const run = runInstaller(script, ["--version", "v1.2.3"]);

      expect(run.status).toBe(1);
      expect(run.stdout).not.toContain("resolved latest version");
      expect(run.requestedUrls).toEqual([
        "https://github.com/tooppoo/rellog/releases/download/v1.2.3/checksums.txt",
      ]);
    },
  );

  test("rejects a pinned version that is not a valid Git tag", () => {
    const script = generateFromFixture("release-version-file-tar-gz");
    const run = runInstaller(script, ["--version", "v1 .2"]);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("--version must be a valid Git tag");
    expect(run.requestedUrls).toEqual([]);
  });
});
