/**
 * Generates `docs/reference/runtime-dependencies.md` — the single, authoritative
 * Runtime Dependencies document — from `packages/core/src/runtimeDependencies/definitions.ts`
 * (issue #75). Other docs (`docs/guide/generated-installer-runtime.md`,
 * `docs/guide/installer-contract.md`) link to this file instead of listing
 * commands themselves, so there is exactly one place this list can drift.
 *
 * Usage:
 *   bun scripts/generate-runtime-dependency-docs.ts          # (re)generate the doc
 *   bun scripts/generate-runtime-dependency-docs.ts --check  # fail if the doc is stale
 */
import path from "node:path";

import {
  ARCHIVE_FORMAT_COMMAND_NAMES,
  BASE_COMMAND_DEPENDENCIES,
  CHECKSUM_DEPENDENCY,
} from "../packages/core/src/runtimeDependencies/definitions";

const root = path.dirname(import.meta.dir);
const outputPath = path.join(root, "docs", "reference", "runtime-dependencies.md");

function commandNameOf(dependency: (typeof BASE_COMMAND_DEPENDENCIES)[number]): string {
  if (dependency.check.type !== "command") {
    throw new Error(`expected a single-command dependency: ${dependency.id}`);
  }
  return dependency.check.command;
}

function checksumLabel(): string {
  if (CHECKSUM_DEPENDENCY.check.type !== "any-command") {
    throw new Error("expected the checksum dependency to be an any-command check");
  }
  return CHECKSUM_DEPENDENCY.check.commands.map((command) => `\`${command}\``).join(" or ");
}

const requiredCommandLines = [
  ...BASE_COMMAND_DEPENDENCIES.map((dependency) => `- \`${commandNameOf(dependency)}\``),
  `- ${checksumLabel()}`,
];

const document = `# Generated Installer Runtime Dependencies

<!-- AUTO-GENERATED FILE — DO NOT EDIT. -->
<!-- Source of truth: \`packages/core/src/runtimeDependencies/definitions.ts\` -->
<!-- Regenerate with: bun run docs:generate -->

Required commands for every generated installer:

${requiredCommandLines.join("\n")}

Archive-format-specific commands:

- \`${ARCHIVE_FORMAT_COMMAND_NAMES["tar.gz"]}\` when \`archive.format\` is \`tar.gz\`
- \`${ARCHIVE_FORMAT_COMMAND_NAMES.zip}\` when \`archive.format\` is \`zip\`

If any required command is missing, the generated installer should stop with a clear error. Run \`sh install.sh --requirements\` to print the requirements resolved for that specific generated installer (its one selected archive-format command, plus reasons, premises, network, and filesystem items this generic list omits), or \`sh install.sh --check-requirements\` to probe for missing commands on the current host.
`;

const checkMode = process.argv.includes("--check");

if (checkMode) {
  const existing = (await Bun.file(outputPath).exists()) ? await Bun.file(outputPath).text() : null;
  if (existing !== document) {
    console.error(
      `${path.relative(root, outputPath)} is out of sync with the runtime dependency definitions.`,
    );
    console.error("Run: bun run docs:generate");
    process.exit(1);
  }
  console.log(`${path.relative(root, outputPath)} is in sync.`);
} else {
  await Bun.write(outputPath, document);
  console.log(`Generated ${path.relative(root, outputPath)}.`);
}
