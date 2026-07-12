import { spawnSync } from "node:child_process";
import { cliVersion } from "../packages/cli/src/version";
import readline from "node:readline";
import { parseArgs } from "node:util";

try {
  const args = parseArgs({
    args: Bun.argv,
    strict: true,
    allowPositionals: true,
  });
  const [, , expectedVersion] = args.positionals;

  if (expectedVersion && expectedVersion !== cliVersion) {
    console.error(
      `Error: Expected version ${expectedVersion} does not match current CLI version ${cliVersion}.`,
    );
    process.exit(1);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question(`Are you sure you want to release CLI version ${cliVersion}? (y/n): `, (answer) => {
    rl.close();
    if (answer.toLowerCase() === "y") {
      releaseCliVersion();
    } else {
      console.log("Release aborted.");
    }
  });
} catch (error) {
  console.error("Error during release process:", error);
}

function releaseCliVersion() {
  try {
    console.log("Releasing CLI version:", cliVersion, ":start");

    spawnSync("git", ["tag", cliVersion], { stdio: "inherit" });
    spawnSync("git", ["push", "--tags"], { stdio: "inherit" });
    console.log("Releasing CLI version:", cliVersion, ":done");
  } catch (error) {
    console.error("Error releasing CLI version:", cliVersion, error);
  }
}
