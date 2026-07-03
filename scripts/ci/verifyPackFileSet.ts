/**
 * Verifies `npm pack --dry-run --json`'s file set against the single
 * source of truth (`PUBLISH_DIR_FILES`), and that the CLI bin entry keeps
 * its executable bit in the packed tarball, not just on disk.
 *
 * Usage (from the `package-tarball` CI job, cwd = dist-cli/npm/):
 *   npm pack --dry-run --json | bun run ../../scripts/ci/verifyPackFileSet.ts
 */
import { NPM_CLI_BIN_NAME, PUBLISH_DIR_FILES } from "../npmPublishDir";

type NpmPackDryRunEntry = {
  files: { path: string; mode: number }[];
};

const input = await Bun.stdin.text();
const [entry] = JSON.parse(input) as NpmPackDryRunEntry[];
const actual = (entry?.files ?? []).map((file) => file.path).sort();
const expected = [...PUBLISH_DIR_FILES].sort();

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  console.error(
    `npm pack file set mismatch.\nexpected: ${expected.join(", ")}\nactual:   ${actual.join(", ")}`,
  );
  process.exit(1);
}

const binPath = `bin/${NPM_CLI_BIN_NAME}`;
const bin = entry?.files.find((file) => file.path === binPath);
if (((bin?.mode ?? 0) & 0o111) === 0) {
  console.error(`npm pack: ${binPath} lost its executable bit (mode ${bin?.mode})`);
  process.exit(1);
}

console.log("npm pack file set: ok");
