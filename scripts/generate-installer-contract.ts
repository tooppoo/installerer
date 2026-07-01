/**
 * Converts `docs/installer-contract.md` (the source of truth) into a browser
 * module so the UI can display the contract without fetching anything at
 * runtime (see issue #9).
 *
 * Usage:
 *   bun scripts/generate-installer-contract.ts          # (re)generate the module
 *   bun scripts/generate-installer-contract.ts --check  # fail if the module is stale
 *
 * The check compares the module's exported string with the Markdown source
 * instead of file bytes, so formatter rewrites of the generated file do not
 * break the check.
 */
import path from "node:path";

const root = path.dirname(import.meta.dir);
const sourcePath = path.join(root, "docs", "installer-contract.md");
const outputPath = path.join(root, "src", "generated", "installerContract.ts");

const markdown = await Bun.file(sourcePath).text();

const checkMode = process.argv.includes("--check");

if (checkMode) {
  let generated: string | null = null;
  if (await Bun.file(outputPath).exists()) {
    const module = (await import(outputPath)) as { INSTALLER_CONTRACT_MARKDOWN?: string };
    generated = module.INSTALLER_CONTRACT_MARKDOWN ?? null;
  }
  if (generated !== markdown) {
    console.error(
      `${path.relative(root, outputPath)} is out of sync with ${path.relative(root, sourcePath)}.`,
    );
    console.error("Run: bun run docs:generate");
    process.exit(1);
  }
  console.log(`${path.relative(root, outputPath)} is in sync.`);
} else {
  const module = `// AUTO-GENERATED FILE — DO NOT EDIT.
// Source of truth: docs/installer-contract.md
// Regenerate with: bun run docs:generate

export const INSTALLER_CONTRACT_MARKDOWN = ${JSON.stringify(markdown)};
`;
  await Bun.write(outputPath, module);
  // Keep the generated module formatter-clean so `oxfmt --check .` passes as-is.
  const format = Bun.spawnSync(["bun", "x", "oxfmt", outputPath], { cwd: root });
  if (format.exitCode !== 0) {
    console.error(format.stderr.toString());
    process.exit(format.exitCode);
  }
  console.log(`Generated ${path.relative(root, outputPath)}.`);
}
