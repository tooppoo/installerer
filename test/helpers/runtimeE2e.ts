import { expect } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Harness for generated-installer runtime e2e tests (issue #13).
 *
 * The test-only URL base seam lives entirely here: production
 * `generateInstaller` output is taken as-is and its GitHub Release base URL
 * is rewritten to the local fixture server as a test-build transformation.
 * Nothing in src/ or the user-facing JSON config can influence the base URL.
 */

const GITHUB_BASE_URL = "https://github.com";

/**
 * Rewrites the GitHub Release base URL of a generated installer to the local
 * fixture server. Asserts the production script contains exactly the URL
 * constructions the generator is known to emit (7 with a version file
 * resolver, 6 without — including the one reference in the leading
 * disclaimer comment and the one in the effective-config metadata comment's
 * generator.sourceUrl field) and that no GitHub reference survives the
 * rewrite, so a test run can never silently fall through to the real
 * network.
 */
export function rewriteBaseUrlForTest(script: string, baseUrl: string): string {
  const occurrences = script.split(GITHUB_BASE_URL).length - 1;
  expect([6, 7]).toContain(occurrences);

  const rewritten = script.replaceAll(GITHUB_BASE_URL, baseUrl);
  expect(rewritten).not.toContain(GITHUB_BASE_URL);
  expect(rewritten).not.toContain("github.com");
  return rewritten;
}

/** `<sha256>  <filename>` rows, matching the documented checksum contract. */
export function checksumRow(archiveBytes: Uint8Array, filename: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(archiveBytes);
  return `${hasher.digest("hex")}  ${filename}\n`;
}

export type ArchiveEntry = {
  path: string;
  content: string;
};

/** Builds a tar.gz or zip fixture archive with the same CLI tools the runtime extracts with. */
export function buildArchive(format: "tar.gz" | "zip", entries: ArchiveEntry[]): Uint8Array {
  const workDir = mkdtempSync(join(tmpdir(), "installerer-e2e-archive-"));

  try {
    for (const entry of entries) {
      const filePath = join(workDir, entry.path);
      mkdirSync(join(filePath, ".."), { recursive: true });
      writeFileSync(filePath, entry.content);
      chmodSync(filePath, 0o755);
    }

    const archivePath = join(workDir, format === "tar.gz" ? "fixture.tar.gz" : "fixture.zip");
    const paths = entries.map((entry) => entry.path);
    const command =
      format === "tar.gz"
        ? spawnSync("tar", ["-czf", archivePath, "-C", workDir, ...paths], { encoding: "utf8" })
        : spawnSync("zip", ["-q", archivePath, ...paths], { cwd: workDir, encoding: "utf8" });

    if (command.status !== 0) {
      throw new Error(`failed to build ${format} fixture archive: ${command.stderr}`);
    }

    return new Uint8Array(readFileSync(archivePath));
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

export type InstallerRunOptions = {
  args?: string[];
  /** Simulated `uname -s` output; defaults to Linux so runs are host-independent. */
  unameOs?: string;
  /** Simulated `uname -m` output. */
  unameArch?: string;
};

export type InstallerRunResult = {
  status: number;
  stdout: string;
  stderr: string;
  /** Entries left under the test-owned TMPDIR after the run; empty means the runtime cleaned up. */
  leftoverTmpEntries: string[];
};

export type InstallerRunEnv = {
  /** Test-owned HOME for this run environment. */
  home: string;
  /** Where `defaults.installDir = "$HOME/.local/bin"` resolves to. */
  defaultInstallDir: string;
  /** Test-owned TMPDIR parent handed to the installer process. */
  tmpParent: string;
  run(script: string, options?: InstallerRunOptions): Promise<InstallerRunResult>;
};

/**
 * Creates an isolated run environment and returns a runner that executes a
 * (rewritten) installer script as a real `sh` process.
 *
 * A PATH shim replaces `uname` so OS/arch detection is simulated instead of
 * depending on the CI host. HOME and TMPDIR point at fresh test-owned
 * directories so the default install dir and temporary-directory cleanup are
 * observable, and tests can pre-place files (for example an existing binary)
 * before running.
 */
export function createInstallerRunEnv(): InstallerRunEnv {
  const runDir = mkdtempSync(join(tmpdir(), "installerer-e2e-run-"));
  const home = join(runDir, "home");
  const tmpParent = join(runDir, "tmp");
  const shimDir = join(runDir, "shim");
  mkdirSync(home, { recursive: true });
  mkdirSync(tmpParent, { recursive: true });
  mkdirSync(shimDir, { recursive: true });

  const unameShim = `#!/bin/sh
case "$1" in
  -s) printf '%s\\n' "\${FAKE_UNAME_S:?}" ;;
  -m) printf '%s\\n' "\${FAKE_UNAME_M:?}" ;;
  *) printf 'uname shim: unsupported flag %s\\n' "$1" >&2; exit 1 ;;
esac
`;
  writeFileSync(join(shimDir, "uname"), unameShim);
  chmodSync(join(shimDir, "uname"), 0o755);

  return {
    home,
    defaultInstallDir: join(home, ".local", "bin"),
    tmpParent,
    // The installer talks to the in-process fixture server, so the child must
    // run asynchronously: a spawnSync would block the event loop and deadlock
    // every curl request against Bun.serve.
    async run(script, options = {}) {
      const child = Bun.spawn(["sh", "-s", "--", ...(options.args ?? [])], {
        stdin: new TextEncoder().encode(script),
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          PATH: `${shimDir}:${process.env.PATH ?? ""}`,
          HOME: home,
          TMPDIR: tmpParent,
          FAKE_UNAME_S: options.unameOs ?? "Linux",
          FAKE_UNAME_M: options.unameArch ?? "x86_64",
        },
      });
      const [stdout, stderr, status] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);

      return {
        status,
        stdout,
        stderr,
        leftoverTmpEntries: readdirSync(tmpParent),
      };
    },
  };
}
