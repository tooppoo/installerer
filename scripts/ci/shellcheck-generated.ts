/**
 * Runs ShellCheck over the generated installer for every valid fixture
 * (issue #57). Snapshot tests, static assertions, and runtime e2e tests
 * already cover behavior; this adds basic POSIX sh quality checks on top,
 * without replacing them.
 *
 * Usage:
 *   bun run shellcheck:generated
 *   bun scripts/ci/shellcheck-generated.ts
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { generateInstaller } from "../../packages/core/src/installerGenerator";
import { parseInstallerConfig } from "../../packages/core/src/installerConfig";
import { loadValidFixtures } from "../../packages/core/test/helpers/fixtures";

function runCommand(command: string, args: readonly string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function main(): Promise<void> {
  console.log("ShellCheck version:");
  const versionExitCode = await runCommand("shellcheck", ["--version"]).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      console.error(
        "shellcheck is not installed. Run `sh scripts/setup-dev.sh` (or `sh scripts/dev/setup-apt-pkg.sh`) first.",
      );
      process.exit(1);
    }
    throw error;
  });
  if (versionExitCode !== 0) {
    process.exit(versionExitCode);
  }

  const fixtures = loadValidFixtures();
  const workDir = await mkdtemp(path.join(tmpdir(), "installerer-shellcheck-"));

  try {
    const scriptPaths: string[] = [];
    for (const fixture of fixtures) {
      const parsed = parseInstallerConfig(fixture.json);
      if (!parsed.ok) {
        throw new Error(`fixture ${fixture.name} failed to parse: ${JSON.stringify(parsed.errors)}`);
      }

      const script = generateInstaller(parsed.config);
      const scriptPath = path.join(workDir, `${fixture.name}.sh`);
      await writeFile(scriptPath, script);
      scriptPaths.push(scriptPath);
    }

    console.log(`Running ShellCheck over ${scriptPaths.length} generated installer(s)...`);
    const exitCode = await runCommand("shellcheck", ["-s", "sh", "--severity=warning", ...scriptPaths]);

    if (exitCode !== 0) {
      process.exit(exitCode);
    }
    console.log("shellcheck:generated: ok");
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

await main();
