import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "bun:test";

import {
  BINARY_RELEASE_TARGETS,
  CHECKSUMS_FILE_NAME,
  PUBLIC_BINARY_DIR,
  RAW_BINARY_ROOT,
  STANDALONE_BINARY_NAME,
  VERSION_FILE_NAME,
  assertReleaseTagMatchesVersion,
  assertReleaseVersion,
  binaryArchiveFileName,
  createBinaryReleaseArtifacts,
  releaseVersionFromTag,
  verifyCreatedArtifacts,
} from "./releaseBinaryArchive";

describe("binary release archive contract", () => {
  test("defines the v0 Bun target to public archive label mapping", () => {
    expect(BINARY_RELEASE_TARGETS).toEqual([
      {
        bunTarget: "bun-linux-x64-baseline",
        archiveLabel: "Linux_x86_64",
      },
      {
        bunTarget: "bun-linux-arm64",
        archiveLabel: "Linux_arm64",
      },
      {
        bunTarget: "bun-darwin-x64",
        archiveLabel: "Darwin_x86_64",
      },
      {
        bunTarget: "bun-darwin-arm64",
        archiveLabel: "Darwin_arm64",
      },
    ]);
  });

  test("generates archives, checksums, and VERSION with the public contract", async () => {
    const repoRoot = await makeFixtureRepoRoot();
    const version = "1.2.3";
    await writeFakeRawBinaries(repoRoot);

    const result = await createBinaryReleaseArtifacts({ repoRoot, version });

    const archiveNames = result.archives.map((archive) => archive.archiveFileName);
    expect(archiveNames).toEqual([
      "installerer_1.2.3_Darwin_arm64.tar.gz",
      "installerer_1.2.3_Darwin_x86_64.tar.gz",
      "installerer_1.2.3_Linux_arm64.tar.gz",
      "installerer_1.2.3_Linux_x86_64.tar.gz",
    ]);

    const checksums = await Bun.file(
      path.join(repoRoot, PUBLIC_BINARY_DIR, CHECKSUMS_FILE_NAME),
    ).text();
    const checksumLines = checksums.trimEnd().split("\n");
    expect(checksumLines).toHaveLength(4);
    expect(checksumLines.map((line) => line.split("  ")[1])).toEqual(archiveNames);

    const versionAsset = await Bun.file(
      path.join(repoRoot, PUBLIC_BINARY_DIR, VERSION_FILE_NAME),
    ).text();
    expect(versionAsset).toBe("1.2.3\n");

    for (const archive of result.archives) {
      const listing = await commandOutput(["tar", "-tzf", archive.archivePath]);
      expect(listing.trim()).toBe(STANDALONE_BINARY_NAME);

      const verboseListing = await commandOutput(["tar", "-tvzf", archive.archivePath]);
      expect(verboseListing.split(/\s+/)[0]).toBe("-rwxr-xr-x");
      expect(verboseListing).not.toContain("installerer/installerer");
      expect(verboseListing).not.toContain("bin/installerer");
    }
  });

  test("rejects VERSION values that cannot be represented as one exact line", () => {
    expect(() => assertReleaseVersion("")).toThrow();
    expect(() => assertReleaseVersion(" 1.2.3")).toThrow();
    expect(() => assertReleaseVersion("1.2.3\n")).toThrow();
    expect(() => assertReleaseVersion("1.2.3")).not.toThrow();
  });

  test("requires the GitHub Release tag to match the root package version", () => {
    expect(() => assertReleaseTagMatchesVersion("v1.2.3", "1.2.3")).not.toThrow();
    expect(() => assertReleaseTagMatchesVersion("1.2.3", "1.2.3")).toThrow('must start with "v"');
    expect(() => assertReleaseTagMatchesVersion("v1.2.4", "1.2.3")).toThrow(
      "must resolve to root package version",
    );
  });

  test("normalizes v-prefixed GitHub Release tags to package versions", () => {
    expect(releaseVersionFromTag("v1.2.3")).toBe("1.2.3");
    expect(() => releaseVersionFromTag("1.2.3")).toThrow('must start with "v"');
  });

  test("formats archive filenames without exposing Bun target labels", () => {
    expect(binaryArchiveFileName("1.2.3", "Linux_x86_64")).toBe(
      "installerer_1.2.3_Linux_x86_64.tar.gz",
    );
  });

  test("rejects stale top-level public assets before generating release artifacts", async () => {
    const repoRoot = await makeFixtureRepoRoot();
    const publicBinaryDir = path.join(repoRoot, PUBLIC_BINARY_DIR);
    await mkdir(publicBinaryDir, { recursive: true });
    await writeFile(path.join(publicBinaryDir, "installerer_0.0.0_Linux_x86_64.tar.gz"), "stale");
    await writeFile(path.join(publicBinaryDir, CHECKSUMS_FILE_NAME), "stale\n");
    await writeFile(path.join(publicBinaryDir, VERSION_FILE_NAME), "0.0.0\n");
    await writeFakeRawBinaries(repoRoot);

    await expect(createBinaryReleaseArtifacts({ repoRoot, version: "1.2.3" })).rejects.toThrow(
      "already exists",
    );
  });

  test("rejects unsorted checksum archive order", async () => {
    const repoRoot = await makeFixtureRepoRoot();
    const publicBinaryDir = path.join(repoRoot, PUBLIC_BINARY_DIR);
    await mkdir(publicBinaryDir, { recursive: true });

    await expect(
      verifyCreatedArtifacts({
        publicBinaryDir,
        archives: [
          fakeArchive("installerer_1.2.3_Linux_x86_64.tar.gz"),
          fakeArchive("installerer_1.2.3_Darwin_arm64.tar.gz"),
        ],
        checksumsPath: path.join(publicBinaryDir, CHECKSUMS_FILE_NAME),
        versionPath: path.join(publicBinaryDir, VERSION_FILE_NAME),
        version: "1.2.3",
      }),
    ).rejects.toThrow("sorted");
  });

  test("rejects archives with nested or extra entries", async () => {
    const repoRoot = await makeFixtureRepoRoot();
    const archivePath = path.join(repoRoot, PUBLIC_BINARY_DIR, "bad.tar.gz");
    await makeArchive(repoRoot, archivePath, [
      { name: "installerer", mode: 0o755 },
      { name: "bin/installerer", mode: 0o755 },
    ]);

    await expect(verifyOneArchive(repoRoot, archivePath)).rejects.toThrow("archive root");
  });

  test("rejects archives where installerer is not mode 755", async () => {
    const repoRoot = await makeFixtureRepoRoot();
    const archivePath = path.join(repoRoot, PUBLIC_BINARY_DIR, "bad.tar.gz");
    await makeArchive(repoRoot, archivePath, [{ name: "installerer", mode: 0o644 }]);

    await expect(verifyOneArchive(repoRoot, archivePath)).rejects.toThrow("mode must be 755");
  });

  test("rejects checksum files that do not exactly match archive filenames", async () => {
    const repoRoot = await makeFixtureRepoRoot();
    await writeFakeRawBinaries(repoRoot);
    const result = await createBinaryReleaseArtifacts({ repoRoot, version: "1.2.3" });
    await writeFile(
      result.checksumsPath,
      ["00  a.tar.gz", "00  b.tar.gz", "00  c.tar.gz", "00  d.tar.gz"].join("\n") + "\n",
    );

    await expect(
      verifyCreatedArtifacts({
        publicBinaryDir: path.join(repoRoot, PUBLIC_BINARY_DIR),
        archives: result.archives,
        checksumsPath: result.checksumsPath,
        versionPath: result.versionPath,
        version: "1.2.3",
      }),
    ).rejects.toThrow("checksums.txt missing");
  });

  test("rejects extra top-level public archives not covered by checksums", async () => {
    const repoRoot = await makeFixtureRepoRoot();
    await writeFakeRawBinaries(repoRoot);
    const result = await createBinaryReleaseArtifacts({ repoRoot, version: "1.2.3" });
    await writeFile(
      path.join(repoRoot, PUBLIC_BINARY_DIR, "installerer_0.0.0_Linux_x86_64.tar.gz"),
      "stale",
    );

    await expect(
      verifyCreatedArtifacts({
        publicBinaryDir: path.join(repoRoot, PUBLIC_BINARY_DIR),
        archives: result.archives,
        checksumsPath: result.checksumsPath,
        versionPath: result.versionPath,
        version: "1.2.3",
      }),
    ).rejects.toThrow("unexpected public archive");
  });

  test("rejects VERSION assets that do not exactly match the canonical version", async () => {
    const repoRoot = await makeFixtureRepoRoot();
    await writeFakeRawBinaries(repoRoot);
    const result = await createBinaryReleaseArtifacts({ repoRoot, version: "1.2.3" });
    await writeFile(result.versionPath, "1.2.3 \n");

    await expect(
      verifyCreatedArtifacts({
        publicBinaryDir: path.join(repoRoot, PUBLIC_BINARY_DIR),
        archives: result.archives,
        checksumsPath: result.checksumsPath,
        versionPath: result.versionPath,
        version: "1.2.3",
      }),
    ).rejects.toThrow("VERSION asset");
  });
});

async function makeFixtureRepoRoot(): Promise<string> {
  const repoRoot = path.join("/tmp", `installerer-release-archive-${crypto.randomUUID()}`);
  await mkdir(repoRoot, { recursive: true });
  return repoRoot;
}

async function writeFakeRawBinaries(repoRoot: string): Promise<void> {
  for (const target of BINARY_RELEASE_TARGETS) {
    const dir = path.join(repoRoot, RAW_BINARY_ROOT, target.bunTarget);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, STANDALONE_BINARY_NAME), "#!/bin/sh\nexit 0\n", {
      mode: 0o755,
    });
  }
}

function fakeArchive(archiveFileName: string) {
  return {
    bunTarget: "bun-linux-x64-baseline",
    archiveLabel: "Linux_x86_64",
    archiveFileName,
    archivePath: path.join("/tmp", archiveFileName),
    sha256: "00",
  };
}

async function verifyOneArchive(repoRoot: string, archivePath: string): Promise<void> {
  const publicBinaryDir = path.dirname(archivePath);
  const checksumsPath = path.join(publicBinaryDir, CHECKSUMS_FILE_NAME);
  const versionPath = path.join(publicBinaryDir, VERSION_FILE_NAME);
  await writeFile(
    checksumsPath,
    ["00  bad.tar.gz", "00  filler-a.tar.gz", "00  filler-b.tar.gz", "00  filler-c.tar.gz"].join(
      "\n",
    ) + "\n",
  );
  await writeFile(versionPath, "1.2.3\n");
  await verifyCreatedArtifacts({
    publicBinaryDir,
    archives: [
      {
        bunTarget: "bun-linux-x64-baseline",
        archiveLabel: "Linux_x86_64",
        archiveFileName: path.basename(archivePath),
        archivePath,
        sha256: "00",
      },
    ],
    checksumsPath,
    versionPath,
    version: "1.2.3",
  });
}

async function makeArchive(
  repoRoot: string,
  archivePath: string,
  entries: readonly { readonly name: string; readonly mode: number }[],
): Promise<void> {
  const stageDir = path.join(repoRoot, "stage");
  await rm(stageDir, { recursive: true, force: true });
  for (const entry of entries) {
    const filePath = path.join(stageDir, entry.name);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "#!/bin/sh\nexit 0\n");
    await chmod(filePath, entry.mode);
  }
  await mkdir(path.dirname(archivePath), { recursive: true });
  await commandOutput([
    "tar",
    "-czf",
    archivePath,
    "-C",
    stageDir,
    ...entries.map((entry) => entry.name),
  ]);
}

async function commandOutput(args: readonly string[]): Promise<string> {
  const proc = Bun.spawn([...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr);
  }
  return stdout;
}
