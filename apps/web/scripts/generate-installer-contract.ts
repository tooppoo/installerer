/**
 * Converts `docs/guide/installer-contract.md` (the source of truth) into a browser
 * module so the UI can display the contract without fetching anything at
 * runtime (see issue #9).
 *
 * The source Markdown keeps relative links (e.g. `./install-semantics.md`)
 * so it renders correctly on GitHub. Since the UI has no repository file
 * structure to resolve those against, relative links are rewritten to
 * absolute GitHub blob URLs on `main` during generation. The Markdown is
 * also split into text/link segments so the UI can render links as real
 * `<a>` elements without parsing Markdown itself.
 *
 * Usage:
 *   bun scripts/generate-installer-contract.ts          # (re)generate the module
 *   bun scripts/generate-installer-contract.ts --check  # fail if the module is stale
 *
 * The check compares the module's exports with the rewritten Markdown
 * source instead of file bytes, so formatter rewrites of the generated
 * file do not break the check.
 */
import path from "node:path";

// This script is Web build support owned by apps/web (issue #100); the
// source Markdown stays in the repository-level docs/ directory.
const packageRoot = path.dirname(import.meta.dir);
const repoRoot = path.join(packageRoot, "..", "..");
const sourcePath = path.join(repoRoot, "docs", "guide", "installer-contract.md");
const outputPath = path.join(packageRoot, "src", "generated", "installerContract.ts");

const repoBlobBase = "https://github.com/tooppoo/installerer/blob/main";
const sourceDir = path.posix.dirname(path.relative(repoRoot, sourcePath).split(path.sep).join("/"));

function rewriteRelativeLinks(markdown: string): string {
  return markdown.replace(/\]\(([^)]+)\)/g, (fullMatch, link: string) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(link) || link.startsWith("#") || link.startsWith("/")) {
      return fullMatch;
    }
    const resolved = path.posix.normalize(path.posix.join(sourceDir, link));
    return `](${repoBlobBase}/${resolved})`;
  });
}

type ContractSegment =
  | { type: "text"; value: string }
  | { type: "link"; label: string; url: string };

function toSegments(markdown: string): ContractSegment[] {
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const segments: ContractSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(markdown)) !== null) {
    const fullMatch = match[0];
    const label = match[1] ?? "";
    const url = match[2] ?? "";
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: markdown.slice(lastIndex, match.index) });
    }
    segments.push({ type: "link", label, url });
    lastIndex = match.index + fullMatch.length;
  }
  if (lastIndex < markdown.length) {
    segments.push({ type: "text", value: markdown.slice(lastIndex) });
  }

  return segments;
}

const markdown = rewriteRelativeLinks(await Bun.file(sourcePath).text());
const segments = toSegments(markdown);

const checkMode = process.argv.includes("--check");

if (checkMode) {
  let generatedMarkdown: string | null = null;
  let generatedSegments: ContractSegment[] | null = null;
  if (await Bun.file(outputPath).exists()) {
    const module = (await import(outputPath)) as {
      INSTALLER_CONTRACT_MARKDOWN?: string;
      INSTALLER_CONTRACT_SEGMENTS?: ContractSegment[];
    };
    generatedMarkdown = module.INSTALLER_CONTRACT_MARKDOWN ?? null;
    generatedSegments = module.INSTALLER_CONTRACT_SEGMENTS ?? null;
  }
  const inSync =
    generatedMarkdown === markdown &&
    JSON.stringify(generatedSegments) === JSON.stringify(segments);
  if (!inSync) {
    console.error(
      `${path.relative(repoRoot, outputPath)} is out of sync with ${path.relative(repoRoot, sourcePath)}.`,
    );
    console.error("Run: bun run docs:generate");
    process.exit(1);
  }
  console.log(`${path.relative(repoRoot, outputPath)} is in sync.`);
} else {
  const module = `// AUTO-GENERATED FILE — DO NOT EDIT.
// Source of truth: docs/guide/installer-contract.md
// Regenerate with: bun run docs:generate

export type InstallerContractSegment =
  | { type: "text"; value: string }
  | { type: "link"; label: string; url: string };

export const INSTALLER_CONTRACT_MARKDOWN = ${JSON.stringify(markdown)};

export const INSTALLER_CONTRACT_SEGMENTS: InstallerContractSegment[] = ${JSON.stringify(segments)};
`;
  await Bun.write(outputPath, module);
  // Keep the generated module formatter-clean so `oxfmt --check .` passes as-is.
  const format = Bun.spawnSync(["bun", "x", "oxfmt", outputPath], { cwd: packageRoot });
  if (format.exitCode !== 0) {
    console.error(format.stderr.toString());
    process.exit(format.exitCode);
  }
  console.log(`Generated ${path.relative(repoRoot, outputPath)}.`);
}
