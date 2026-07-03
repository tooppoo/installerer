import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { validateInstallerConfig } from "../../src/installerConfig";
import { generateInstaller } from "../../src/installerGenerator";
import { RELEASE_ASSET_PATH_SHAPE, startFixtureServer } from "../helpers/fixtureServer";
import type { FixtureServer } from "../helpers/fixtureServer";
import {
  buildArchive,
  checksumRow,
  createInstallerRunEnv,
  rewriteBaseUrlForTest,
} from "../helpers/runtimeE2e";
import { assertGeneratedInstallerContract } from "../helpers/staticAssertions";

/**
 * Fixture-based runtime e2e for the generated installer (issue #13).
 *
 * The generated script runs as a real `sh` process with real curl / tar /
 * unzip / sha256sum, downloading from a local fixture HTTP server that
 * accepts the GitHub Release download path shape. No real GitHub Release is
 * involved. OS/arch detection is simulated with a `uname` PATH shim so the
 * suite does not depend on the CI host.
 *
 * Fixture configs deliberately use configured asset names (`LATEST_VERSION`,
 * `SHA256SUMS`) instead of the representative `VERSION` / `checksums.txt` so
 * a runtime that hard-codes the representative names fails here.
 */

const OWNER = "fixture-owner";
const REPO = "fixture-repo";
const VERSION_FILE_NAME = "LATEST_VERSION";
const CHECKSUM_FILE_NAME = "SHA256SUMS";

const RELEASE_VERSION_FILE_CONFIG = {
  owner: OWNER,
  repo: REPO,
  binary: { name: "demo", pathInArchive: "bin/demo" },
  versionResolver: { type: "release_version_file", fileName: VERSION_FILE_NAME },
  archive: { format: "tar.gz", nameTemplate: "{bin}_{version}_{os}_{arch}.tar.gz" },
  checksum: { fileName: CHECKSUM_FILE_NAME, algorithm: "sha256" },
  targets: [{ os: "linux", arch: "x86_64" }],
  defaults: { installDir: "$HOME/.local/bin" },
};

const LATEST_ASSET_CONFIG = {
  owner: OWNER,
  repo: REPO,
  binary: { name: "demo", pathInArchive: "demo" },
  versionResolver: { type: "latest_asset" },
  archive: { format: "zip", nameTemplate: "{bin}_{os}_{arch}.zip" },
  checksum: { fileName: CHECKSUM_FILE_NAME, algorithm: "sha256" },
  targets: [{ os: "linux", arch: "x86_64" }],
  defaults: { installDir: "$HOME/.local/bin" },
};

/** Custom (non-preset) architecture labels (issue #76), distinct per canonical arch. */
const CUSTOM_ARCH_LABEL_CONFIG = {
  ...LATEST_ASSET_CONFIG,
  architectureLabels: { x86_64: "x64", aarch64: "arm64-v8a" },
};

const LATEST_BINARY = "#!/bin/sh\necho demo latest fixture\n";
const PINNED_BINARY = "#!/bin/sh\necho demo pinned fixture\n";

let server: FixtureServer;

beforeAll(() => {
  server = startFixtureServer();
});

afterAll(() => {
  server.stop();
});

beforeEach(() => {
  server.clear();
});

function generateProductionScript(config: unknown): string {
  const result = validateInstallerConfig(config);
  if (!result.ok) {
    throw new Error(`e2e fixture config must be valid: ${JSON.stringify(result.errors)}`);
  }

  const script = generateInstaller(result.config);

  // The production output must not carry any test URL, base URL override, or
  // non-GitHub network path before the harness applies the test-only seam.
  assertGeneratedInstallerContract(script, {
    archiveFormat: result.config.archive.format,
    resolverType: result.config.versionResolver.type,
  });
  expect(script).not.toContain("http://");

  return script;
}

function testScript(config: unknown): string {
  return rewriteBaseUrlForTest(generateProductionScript(config), server.baseUrl);
}

function expectRequests(expected: string[]): void {
  expect(server.requestLog).toEqual(expected);
  for (const path of server.requestLog) {
    expect(path).toMatch(RELEASE_ASSET_PATH_SHAPE);
  }
}

function expectInstalledBinary(installDir: string, name: string, content: string): void {
  const installedPath = join(installDir, name);
  expect(existsSync(installedPath)).toBe(true);
  expect(readFileSync(installedPath, "utf8")).toBe(content);
  expect(statSync(installedPath).mode & 0o111).not.toBe(0);
}

function placeExistingBinary(installDir: string, name: string, content: string): string {
  mkdirSync(installDir, { recursive: true });
  const path = join(installDir, name);
  writeFileSync(path, content);
  return path;
}

describe("release_version_file runtime e2e (tar.gz)", () => {
  const archive = buildArchive("tar.gz", [{ path: "bin/demo", content: LATEST_BINARY }]);
  const pinnedArchive = buildArchive("tar.gz", [{ path: "bin/demo", content: PINNED_BINARY }]);
  const latestAssetName = "demo_v2.0.0_linux_amd64.tar.gz";
  const pinnedAssetName = "demo_v1.0.0_linux_amd64.tar.gz";

  test("latest install resolves the configured version file, then installs from the tag", async () => {
    server.setLatestRelease(OWNER, REPO, { [VERSION_FILE_NAME]: "v2.0.0\n" });
    server.setTaggedRelease(OWNER, REPO, "v2.0.0", {
      [CHECKSUM_FILE_NAME]: checksumRow(archive, latestAssetName),
      [latestAssetName]: archive,
    });

    const env = createInstallerRunEnv();
    const run = await env.run(testScript(RELEASE_VERSION_FILE_CONFIG));

    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("installerer: resolved latest version v2.0.0");
    expect(run.stdout).toContain(`installed demo to ${env.defaultInstallDir}/demo`);

    // --install-dir omitted: the default must resolve to $HOME/.local/bin.
    expectInstalledBinary(env.defaultInstallDir, "demo", LATEST_BINARY);

    // Exactly version file -> checksum file -> archive, all in the GitHub
    // Release download path shape; nothing else (no API, no raw/gist).
    expectRequests([
      `/${OWNER}/${REPO}/releases/latest/download/${VERSION_FILE_NAME}`,
      `/${OWNER}/${REPO}/releases/download/v2.0.0/${CHECKSUM_FILE_NAME}`,
      `/${OWNER}/${REPO}/releases/download/v2.0.0/${latestAssetName}`,
    ]);

    expect(run.leftoverTmpEntries).toEqual([]);
  });

  test("pinned install never touches the version file asset", async () => {
    server.setTaggedRelease(OWNER, REPO, "v1.0.0", {
      [CHECKSUM_FILE_NAME]: checksumRow(pinnedArchive, pinnedAssetName),
      [pinnedAssetName]: pinnedArchive,
    });

    const env = createInstallerRunEnv();
    const run = await env.run(testScript(RELEASE_VERSION_FILE_CONFIG), {
      args: ["--version", "v1.0.0"],
    });

    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expect(run.stdout).not.toContain("resolved latest version");
    expectInstalledBinary(env.defaultInstallDir, "demo", PINNED_BINARY);
    expectRequests([
      `/${OWNER}/${REPO}/releases/download/v1.0.0/${CHECKSUM_FILE_NAME}`,
      `/${OWNER}/${REPO}/releases/download/v1.0.0/${pinnedAssetName}`,
    ]);
    expect(run.leftoverTmpEntries).toEqual([]);
  });
});

describe("latest_asset runtime e2e (zip)", () => {
  const archive = buildArchive("zip", [{ path: "demo", content: LATEST_BINARY }]);
  const pinnedArchive = buildArchive("zip", [{ path: "demo", content: PINNED_BINARY }]);
  const assetName = "demo_linux_amd64.zip";

  test("latest install downloads versionless assets and never a version file", async () => {
    server.setLatestRelease(OWNER, REPO, {
      [CHECKSUM_FILE_NAME]: checksumRow(archive, assetName),
      [assetName]: archive,
    });

    const env = createInstallerRunEnv();
    const run = await env.run(testScript(LATEST_ASSET_CONFIG));

    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("installerer: install source latest");
    expectInstalledBinary(env.defaultInstallDir, "demo", LATEST_BINARY);
    expectRequests([
      `/${OWNER}/${REPO}/releases/latest/download/${CHECKSUM_FILE_NAME}`,
      `/${OWNER}/${REPO}/releases/latest/download/${assetName}`,
    ]);
    expect(run.leftoverTmpEntries).toEqual([]);
  });

  test("pinned install uses the tag URL and never a version file", async () => {
    server.setTaggedRelease(OWNER, REPO, "v3.1.4", {
      [CHECKSUM_FILE_NAME]: checksumRow(pinnedArchive, assetName),
      [assetName]: pinnedArchive,
    });

    const env = createInstallerRunEnv();
    const run = await env.run(testScript(LATEST_ASSET_CONFIG), {
      args: ["--version", "v3.1.4"],
    });

    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expectInstalledBinary(env.defaultInstallDir, "demo", PINNED_BINARY);
    expectRequests([
      `/${OWNER}/${REPO}/releases/download/v3.1.4/${CHECKSUM_FILE_NAME}`,
      `/${OWNER}/${REPO}/releases/download/v3.1.4/${assetName}`,
    ]);
    expect(run.leftoverTmpEntries).toEqual([]);
  });
});

describe("custom architecture label mapping e2e (issue #76)", () => {
  test("a custom (non-preset) asset_arch_label is used to build the download URL", async () => {
    const archive = buildArchive("zip", [{ path: "demo", content: LATEST_BINARY }]);
    const assetName = "demo_linux_x64.zip";
    server.setLatestRelease(OWNER, REPO, {
      [CHECKSUM_FILE_NAME]: checksumRow(archive, assetName),
      [assetName]: archive,
    });

    const env = createInstallerRunEnv();
    const run = await env.run(testScript(CUSTOM_ARCH_LABEL_CONFIG));

    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expectInstalledBinary(env.defaultInstallDir, "demo", LATEST_BINARY);
    expectRequests([
      `/${OWNER}/${REPO}/releases/latest/download/${CHECKSUM_FILE_NAME}`,
      `/${OWNER}/${REPO}/releases/latest/download/${assetName}`,
    ]);
    expect(run.leftoverTmpEntries).toEqual([]);
  });
});

describe("dispatch and argument handling", () => {
  test("--version latest is rejected before any network access", async () => {
    const env = createInstallerRunEnv();
    const run = await env.run(testScript(LATEST_ASSET_CONFIG), {
      args: ["--version", "latest"],
    });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("--version latest is ambiguous");
    expectRequests([]);
    expect(run.leftoverTmpEntries).toEqual([]);
  });

  test("a pinned tag containing a slash round-trips through %2F URL encoding", async () => {
    // The runtime percent-encodes the tag as a single URL path segment
    // (%2F for /), so the fixture server must decode that segment back to
    // "release/v1.2.3" — not split on the decoded slash — to find it.
    const archive = buildArchive("zip", [{ path: "demo", content: PINNED_BINARY }]);
    const assetName = "demo_linux_amd64.zip";
    server.setTaggedRelease(OWNER, REPO, "release/v1.2.3", {
      [CHECKSUM_FILE_NAME]: checksumRow(archive, assetName),
      [assetName]: archive,
    });

    const env = createInstallerRunEnv();
    const run = await env.run(testScript(LATEST_ASSET_CONFIG), {
      args: ["--version", "release/v1.2.3"],
    });

    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expectInstalledBinary(env.defaultInstallDir, "demo", PINNED_BINARY);
    expectRequests([
      `/${OWNER}/${REPO}/releases/download/release%2Fv1.2.3/${CHECKSUM_FILE_NAME}`,
      `/${OWNER}/${REPO}/releases/download/release%2Fv1.2.3/${assetName}`,
    ]);
  });
});

describe("failure handling", () => {
  const validArchive = buildArchive("tar.gz", [{ path: "bin/demo", content: PINNED_BINARY }]);
  const assetName = "demo_v1.0.0_linux_amd64.tar.gz";
  const pinArgs = ["--version", "v1.0.0"];

  test("checksum mismatch stops before extraction and preserves the existing binary", async () => {
    // The served archive is not a valid tar.gz: if the runtime ever attempted
    // extraction, the error would be "failed to extract", not the mismatch.
    server.setTaggedRelease(OWNER, REPO, "v1.0.0", {
      [CHECKSUM_FILE_NAME]: `${"0".repeat(64)}  ${assetName}\n`,
      [assetName]: "this is not a tar.gz archive",
    });

    const env = createInstallerRunEnv();
    const existing = placeExistingBinary(env.defaultInstallDir, "demo", "existing binary\n");
    const run = await env.run(testScript(RELEASE_VERSION_FILE_CONFIG), { args: pinArgs });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("archive checksum mismatch");
    expect(run.stderr).not.toContain("failed to extract");
    expect(readFileSync(existing, "utf8")).toBe("existing binary\n");
    expect(run.leftoverTmpEntries).toEqual([]);
  });

  test("missing checksum row stops before extraction and preserves the existing binary", async () => {
    server.setTaggedRelease(OWNER, REPO, "v1.0.0", {
      [CHECKSUM_FILE_NAME]: checksumRow(validArchive, "some_other_asset.tar.gz"),
      [assetName]: validArchive,
    });

    const env = createInstallerRunEnv();
    const existing = placeExistingBinary(env.defaultInstallDir, "demo", "existing binary\n");
    const run = await env.run(testScript(RELEASE_VERSION_FILE_CONFIG), { args: pinArgs });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(`checksum entry not found for ${assetName}`);
    expect(run.stderr).not.toContain("failed to extract");
    expect(readFileSync(existing, "utf8")).toBe("existing binary\n");
    expect(run.leftoverTmpEntries).toEqual([]);
  });

  test("archive without the configured binary fails and places nothing", async () => {
    const archiveWithoutBinary = buildArchive("tar.gz", [
      { path: "README", content: "no binary here\n" },
    ]);
    server.setTaggedRelease(OWNER, REPO, "v1.0.0", {
      [CHECKSUM_FILE_NAME]: checksumRow(archiveWithoutBinary, assetName),
      [assetName]: archiveWithoutBinary,
    });

    const env = createInstallerRunEnv();
    const run = await env.run(testScript(RELEASE_VERSION_FILE_CONFIG), { args: pinArgs });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("failed to extract bin/demo");
    expect(existsSync(join(env.defaultInstallDir, "demo"))).toBe(false);
    expect(run.leftoverTmpEntries).toEqual([]);
  });
});

describe("unsupported target simulation via uname shim", () => {
  test("unsupported OS fails before any network access", async () => {
    const env = createInstallerRunEnv();
    const run = await env.run(testScript(LATEST_ASSET_CONFIG), { unameOs: "SunOS" });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("unsupported OS: sunos");
    expectRequests([]);
  });

  test("unsupported architecture fails before any network access", async () => {
    const env = createInstallerRunEnv();
    const run = await env.run(testScript(LATEST_ASSET_CONFIG), { unameArch: "mips" });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("unsupported architecture: mips");
    expectRequests([]);
  });

  test("amd64 is not accepted as a raw uname -m value (issue #76)", async () => {
    // The initial runtime canonicalization mapping only recognizes the real
    // `uname -m` outputs x86_64/aarch64/arm64. `amd64` is an asset-label
    // spelling, not a runtime architecture, and must not be special-cased.
    const env = createInstallerRunEnv();
    const run = await env.run(testScript(LATEST_ASSET_CONFIG), { unameArch: "amd64" });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("unsupported architecture: amd64");
    expectRequests([]);
  });

  test("recognized but unconfigured target fails before any network access", async () => {
    const env = createInstallerRunEnv();
    const run = await env.run(testScript(RELEASE_VERSION_FILE_CONFIG), {
      unameOs: "Darwin",
      unameArch: "arm64",
    });

    // "darwin/aarch64" (not "darwin/arm64") in the error proves the runtime
    // canonicalized "arm64" to "aarch64" before checking target support.
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("unsupported target: darwin/aarch64");
    expectRequests([]);
  });
});
