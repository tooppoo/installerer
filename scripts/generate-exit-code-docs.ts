/**
 * Generates `docs/reference/exit-codes.md` — the authoritative CLI exit code
 * table — from `packages/cli/src/exitCodes.ts`, so the documented table
 * cannot drift from the shipped values.
 *
 * The human-readable cause column is derived mechanically from each
 * `CliExitCode` key by splitting its camelCase name into lowercase words
 * (for example `configFileAlreadyExists` -> `config file already exists`).
 *
 * Usage:
 *   bun scripts/generate-exit-code-docs.ts          # (re)generate the doc
 *   bun scripts/generate-exit-code-docs.ts --check  # fail if the doc is stale
 */
import path from "node:path";

import { CliExitCode } from "../packages/cli/src/exitCodes";

const root = path.dirname(import.meta.dir);
const outputPath = path.join(root, "docs", "reference", "exit-codes.md");

function causeOf(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
}

// The table is emitted with padded columns so the output is already
// `oxfmt --check`-clean and the byte-for-byte `--check` mode stays valid.
const entries = Object.entries(CliExitCode)
  .sort(([, a], [, b]) => a - b)
  .map(([key, value]) => [String(value), causeOf(key)] as const);

const headers = ["Exit Code", "Cause"] as const;
const codeWidth = Math.max(headers[0].length, ...entries.map(([code]) => code.length));
const causeWidth = Math.max(headers[1].length, ...entries.map(([, cause]) => cause.length));

function row(code: string, cause: string): string {
  return `| ${code.padEnd(codeWidth)} | ${cause.padEnd(causeWidth)} |`;
}

const tableLines = [
  row(headers[0], headers[1]),
  row("-".repeat(codeWidth), "-".repeat(causeWidth)),
  ...entries.map(([code, cause]) => row(code, cause)),
];

const document = `# installerer CLI Exit Codes

<!-- AUTO-GENERATED FILE — DO NOT EDIT. -->
<!-- Source of truth: \`packages/cli/src/exitCodes.ts\` -->
<!-- Regenerate with: bun run docs:generate -->

See [the CLI exit code contract ADR](../adr/20260703T132416Z_cli-exit-code-contract.md) for the decision record.

${tableLines.join("\n")}
`;

const checkMode = process.argv.includes("--check");

if (checkMode) {
  const existing = (await Bun.file(outputPath).exists()) ? await Bun.file(outputPath).text() : null;
  if (existing !== document) {
    console.error(`${path.relative(root, outputPath)} is out of sync with the CLI exit codes.`);
    console.error("Run: bun run docs:generate");
    process.exit(1);
  }
  console.log(`${path.relative(root, outputPath)} is in sync.`);
} else {
  await Bun.write(outputPath, document);
  console.log(`Generated ${path.relative(root, outputPath)}.`);
}
