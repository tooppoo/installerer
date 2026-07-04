import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import packageJson from "../package.json" with { type: "json" };

export const CLI_BINARY_ENTRYPOINT = "packages/cli/src/node/main.ts";
export const PUBLIC_BINARY_DIR = "dist/binary";
export const RAW_BINARY_ROOT = "dist/binary/raw";
export const STANDALONE_BINARY_NAME = "installerer";
export const CHECKSUMS_FILE_NAME = "checksums.txt";
export const VERSION_FILE_NAME = "VERSION";

export type BinaryReleaseTarget = {
  readonly bunTarget: string;
  readonly archiveLabel: string;
};

export const BINARY_RELEASE_TARGETS = [
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
] as const satisfies readonly BinaryReleaseTarget[];

export type CreateBinaryReleaseArtifactsOptions = {
  readonly repoRoot?: string;
  readonly version?: string;
};

export type CreatedBinaryReleaseArtifact = {
  readonly bunTarget: string;
  readonly archiveLabel: string;
  readonly archiveFileName: string;
  readonly archivePath: string;
  readonly sha256: string;
};

export type CreatedBinaryReleaseArtifacts = {
  readonly version: string;
  readonly archives: readonly CreatedBinaryReleaseArtifact[];
  readonly checksumsPath: string;
  readonly versionPath: string;
};

export function binaryArchiveFileName(version: string, archiveLabel: string): string {
  assertReleaseVersion(version);
  return `installerer_${version}_${archiveLabel}.tar.gz`;
}

export function rawBinaryPath(repoRoot: string, bunTarget: string): string {
  return path.join(repoRoot, RAW_BINARY_ROOT, bunTarget, STANDALONE_BINARY_NAME);
}

export function assertReleaseVersion(version: string): void {
  if (version.length === 0) {
    throw new Error("release binary archive: version must not be empty");
  }
  if (version.trim() !== version || /\s/.test(version)) {
    throw new Error(
      "release binary archive: VERSION asset must be exactly one non-whitespace line",
    );
  }
}

export function assertReleaseTagMatchesVersion(releaseTag: string, version: string): void {
  const tagVersion = releaseVersionFromTag(releaseTag);
  assertReleaseVersion(version);
  if (tagVersion !== version) {
    throw new Error(
      `release binary archive: release tag ${JSON.stringify(releaseTag)} must resolve to package version ${JSON.stringify(version)}`,
    );
  }
}

export function releaseVersionFromTag(releaseTag: string): string {
  if (!releaseTag.startsWith("v")) {
    throw new Error(
      `release binary archive: release tag ${JSON.stringify(releaseTag)} must start with "v"`,
    );
  }
  const version = releaseTag.slice(1);
  assertReleaseVersion(version);
  return version;
}

export async function createBinaryReleaseArtifacts(
  options: CreateBinaryReleaseArtifactsOptions = {},
): Promise<CreatedBinaryReleaseArtifacts> {
  const repoRoot = options.repoRoot ?? path.join(import.meta.dir, "..", "..", "..");
  const version = options.version ?? packageJson.version;
  assertReleaseVersion(version);

  const publicBinaryDir = path.join(repoRoot, PUBLIC_BINARY_DIR);
  await mkdir(publicBinaryDir, { recursive: true });
  await assertNoPublicBinaryAssets(publicBinaryDir);

  const archives: CreatedBinaryReleaseArtifact[] = [];
  for (const target of BINARY_RELEASE_TARGETS) {
    const sourcePath = rawBinaryPath(repoRoot, target.bunTarget);
    await chmod(sourcePath, 0o755);

    const archiveFileName = binaryArchiveFileName(version, target.archiveLabel);
    const archivePath = path.join(publicBinaryDir, archiveFileName);
    await createTarGzWithRootBinary({
      archivePath,
      binaryPath: sourcePath,
      repoRoot,
      targetName: target.bunTarget,
    });

    archives.push({
      bunTarget: target.bunTarget,
      archiveLabel: target.archiveLabel,
      archiveFileName,
      archivePath,
      sha256: await sha256File(archivePath),
    });
  }

  archives.sort((a, b) => a.archiveFileName.localeCompare(b.archiveFileName));

  const checksumsPath = path.join(publicBinaryDir, CHECKSUMS_FILE_NAME);
  await writeFile(
    checksumsPath,
    archives.map((archive) => `${archive.sha256}  ${archive.archiveFileName}`).join("\n") + "\n",
  );

  const versionPath = path.join(publicBinaryDir, VERSION_FILE_NAME);
  await writeFile(versionPath, `${version}\n`);

  await verifyCreatedArtifacts({ publicBinaryDir, archives, checksumsPath, versionPath, version });

  return { version, archives, checksumsPath, versionPath };
}

async function assertNoPublicBinaryAssets(publicBinaryDir: string): Promise<void> {
  for (const entry of await readdir(publicBinaryDir, { withFileTypes: true })) {
    if (
      entry.isFile() &&
      (entry.name.endsWith(".tar.gz") ||
        entry.name === CHECKSUMS_FILE_NAME ||
        entry.name === VERSION_FILE_NAME)
    ) {
      throw new Error(
        `release binary archive: public asset ${entry.name} already exists in ${PUBLIC_BINARY_DIR}`,
      );
    }
  }
}

async function createTarGzWithRootBinary(options: {
  readonly archivePath: string;
  readonly binaryPath: string;
  readonly repoRoot: string;
  readonly targetName: string;
}): Promise<void> {
  const stageDir = path.join(options.repoRoot, "dist", ".binary-archive-stage", options.targetName);
  await rm(stageDir, { recursive: true, force: true });
  await mkdir(stageDir, { recursive: true });

  const stagedBinaryPath = path.join(stageDir, STANDALONE_BINARY_NAME);
  await copyFile(options.binaryPath, stagedBinaryPath);
  await chmod(stagedBinaryPath, 0o755);

  await runCommand([
    "tar",
    "--owner=0",
    "--group=0",
    "--numeric-owner",
    "-czf",
    options.archivePath,
    "-C",
    stageDir,
    STANDALONE_BINARY_NAME,
  ]);
  await rm(stageDir, { recursive: true, force: true });
}

export async function verifyCreatedArtifacts(options: {
  readonly publicBinaryDir: string;
  readonly archives: readonly CreatedBinaryReleaseArtifact[];
  readonly checksumsPath: string;
  readonly versionPath: string;
  readonly version: string;
}): Promise<void> {
  const archiveNames = options.archives.map((archive) => archive.archiveFileName);
  const expectedNames = [...archiveNames].sort((a, b) => a.localeCompare(b));
  if (archiveNames.join("\n") !== expectedNames.join("\n")) {
    throw new Error("release binary archive: archive list is not sorted by archive name");
  }

  for (const archive of options.archives) {
    const entries = await commandOutput(["tar", "-tzf", archive.archivePath]);
    const entryNames = entries
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (entryNames.length !== 1 || entryNames[0] !== STANDALONE_BINARY_NAME) {
      throw new Error(
        `release binary archive: ${archive.archiveFileName} must contain only ${STANDALONE_BINARY_NAME} at archive root`,
      );
    }

    const listing = await commandOutput(["tar", "-tvzf", archive.archivePath]);
    const mode = listing.split(/\s+/)[0];
    if (mode !== "-rwxr-xr-x") {
      throw new Error(
        `release binary archive: ${archive.archiveFileName} ${STANDALONE_BINARY_NAME} mode must be 755`,
      );
    }
  }

  const checksums = await Bun.file(options.checksumsPath).text();
  const checksumLines = checksums.trimEnd().split("\n");
  if (checksumLines.length < BINARY_RELEASE_TARGETS.length) {
    throw new Error("release binary archive: checksums.txt is missing target entries");
  }
  for (const archive of options.archives) {
    const expectedLine = `${archive.sha256}  ${archive.archiveFileName}`;
    if (!checksumLines.includes(expectedLine)) {
      throw new Error(`release binary archive: checksums.txt missing ${archive.archiveFileName}`);
    }
  }

  const versionText = await Bun.file(options.versionPath).text();
  if (versionText !== `${options.version}\n`) {
    throw new Error("release binary archive: VERSION asset must be one exact version line");
  }

  const topLevelPublicAssets = (await readdir(options.publicBinaryDir)).filter((entry) =>
    entry.endsWith(".tar.gz"),
  );
  const expectedArchiveNameSet = new Set(archiveNames);
  for (const asset of topLevelPublicAssets) {
    if (!expectedArchiveNameSet.has(asset)) {
      throw new Error(`release binary archive: unexpected public archive ${asset}`);
    }
  }
  for (const archive of options.archives) {
    if (!topLevelPublicAssets.includes(archive.archiveFileName)) {
      throw new Error(`release binary archive: missing public archive ${archive.archiveFileName}`);
    }
  }
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const file = Bun.file(filePath);
  hash.update(Buffer.from(await file.arrayBuffer()));
  return hash.digest("hex");
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
    throw new Error(`command failed: ${args.join(" ")}\n${stderr}`);
  }
  return stdout;
}

async function runCommand(args: readonly string[]): Promise<void> {
  const proc = Bun.spawn([...args], {
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`command failed: ${args.join(" ")}`);
  }
}

async function main(): Promise<void> {
  const repoRoot = path.join(import.meta.dir, "..", "..", "..");
  const releaseTag = Bun.env.INSTALLERER_RELEASE_TAG;
  if (releaseTag !== undefined) {
    assertReleaseTagMatchesVersion(releaseTag, packageJson.version);
  }
  const result = await createBinaryReleaseArtifacts({ repoRoot });
  console.log(`binary release artifacts generated for version ${result.version}:`);
  for (const archive of result.archives) {
    console.log(`  ${path.relative(repoRoot, archive.archivePath)}`);
  }
  console.log(`  ${path.relative(repoRoot, result.checksumsPath)}`);
  console.log(`  ${path.relative(repoRoot, result.versionPath)}`);
}

if (import.meta.main) {
  await main();
}
