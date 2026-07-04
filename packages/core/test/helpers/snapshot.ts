import { expect } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const SNAPSHOT_DIR = join(import.meta.dir, "..", "snapshots");

/**
 * Normalization contract for generated installer snapshots (issue #10):
 * LF newlines, no trailing whitespace, exactly one final newline, and no
 * meaning-changing rewrites. The generator output is deterministic, so no
 * timestamp or ordering normalization is needed.
 */
export function normalizeGeneratedInstaller(script: string): string {
  const body = script
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");

  return `${body}\n`;
}

/**
 * Compares content against its committed snapshot file `<name>.<extension>`
 * under `test/snapshots/`.
 *
 * Snapshots are a committed regression contract, not an implementation log:
 * update them only when the generator's output changes intentionally, by
 * running `bun run test:update-snapshots` and reviewing the diff.
 */
export function matchTextSnapshot(name: string, extension: string, content: string): void {
  const path = join(SNAPSHOT_DIR, `${name}.${extension}`);

  if (process.env.UPDATE_INSTALLER_SNAPSHOTS === "1") {
    mkdirSync(SNAPSHOT_DIR, { recursive: true });
    writeFileSync(path, content);
    return;
  }

  if (!existsSync(path)) {
    throw new Error(
      `Missing snapshot: ${path}\n` +
        "Snapshots are a committed regression contract and are not created implicitly. " +
        "Run `bun run test:update-snapshots` and review the diff before committing it.",
    );
  }

  const expected = readFileSync(path, "utf8");
  expect(content).toBe(expected);
}

/**
 * Compares the normalized generated installer against its committed snapshot.
 */
export function matchInstallerSnapshot(name: string, normalizedScript: string): void {
  matchTextSnapshot(name, "install.sh", normalizedScript);
}
