import { spawnSync } from "node:child_process";
import { cliVersion } from "../packages/cli/src/version";
import readline from "node:readline";

try {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question(`Are you sure you want to release CLI version ${cliVersion}? (y/n): `, (answer) => {
    rl.close();
    if (answer.toLowerCase() === 'y') {
      releaseCliVersion();
    } else {
      console.log('Release aborted.');
    }
  });
} catch (error) {
  console.error('Error during release process:', error);
}

function releaseCliVersion() {
  try {
    console.log('Releasing CLI version:', cliVersion, ':start');

    spawnSync("git", ["tag", `${cliVersion}`], { stdio: "inherit" });
    spawnSync("git", ["push", "--tags"], { stdio: "inherit" });
    console.log('Releasing CLI version:', cliVersion, ':done');
  } catch (error) {
    console.error('Error releasing CLI version:', cliVersion, error);
  }
}
