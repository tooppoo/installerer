/**
 * Builds the standalone Bun-compiled `installerer` executable for every v0
 * release target. This script intentionally stops at raw executable creation;
 * archive packaging, checksums, VERSION, and GitHub Release upload are release
 * job responsibilities.
 */
import { chmod, mkdir, rm } from "node:fs/promises";
import path from "node:path";

import {
  BINARY_RELEASE_TARGETS,
  CLI_BINARY_ENTRYPOINT,
  rawBinaryPath,
} from "./releaseBinaryArchive";

const repoRoot = path.join(import.meta.dir, "..", "..", "..");
const entrypoint = path.join(repoRoot, CLI_BINARY_ENTRYPOINT);

async function main(): Promise<void> {
  for (const target of BINARY_RELEASE_TARGETS) {
    const outfile = rawBinaryPath(repoRoot, target.bunTarget);
    await rm(path.dirname(outfile), { recursive: true, force: true });
    await mkdir(path.dirname(outfile), { recursive: true });

    await runCommand([
      "bun",
      "build",
      "--compile",
      `--target=${target.bunTarget}`,
      `--outfile=${outfile}`,
      entrypoint,
    ]);
    await chmod(outfile, 0o755);
    console.log(`built ${path.relative(repoRoot, outfile)} from ${CLI_BINARY_ENTRYPOINT}`);
  }
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

await main();
