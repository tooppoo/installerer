import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const SRC_DIR = join(import.meta.dir, "..", "..", "src");

/**
 * The SPA / generator runtime must not talk to the network (issue #10).
 *
 * Scope is the runtime executable code path only:
 * - test files are excluded,
 * - src/generated/ is excluded (docs text bundled at build time),
 * - comments are stripped so documentation URLs cannot trip the scan.
 *
 * The generated installer text embedded in installerGenerator.ts is covered by
 * its own allowlist in test/helpers/staticAssertions.ts; here it must still
 * satisfy the stricter of the two shared rules (github.com URLs only).
 */
function runtimeSourceFiles(dir = SRC_DIR): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name !== "generated") {
        files.push(...runtimeSourceFiles(path));
      }
      continue;
    }

    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) {
      continue;
    }

    files.push(path);
  }

  return files.sort();
}

/**
 * Lightweight comment stripping: block comments, then line comments whose //
 * is not part of a URL scheme (preceded by ':') or inside an obvious string
 * start. This is intentionally not a TypeScript parser.
 */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/[^\n]*/gm, "$1");
}

const FORBIDDEN_RUNTIME_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  // Identifier-boundary aware so e.g. "prefetch" cannot false-positive.
  { pattern: /\bfetch\s*\(/, label: "fetch() call" },
  { pattern: /\bXMLHttpRequest\b/, label: "XMLHttpRequest" },
  { pattern: /api\.github\.com/, label: "GitHub API endpoint" },
  { pattern: /raw\.githubusercontent\.com/, label: "raw content URL" },
  { pattern: /gist\.githubusercontent\.com/, label: "gist content URL" },
];

describe("SPA / generator runtime network boundary", () => {
  const files = runtimeSourceFiles();

  test("scans the expected runtime module set", () => {
    const names = files.map((file) => relative(SRC_DIR, file));

    // Guard: the scan must keep covering the core generator modules. If this
    // fails after moving files, update the expectation deliberately.
    expect(names).toContain("installerGenerator.ts");
    expect(names).toContain("installerConfig.ts");
    expect(names).toContain("App.tsx");
    expect(names.length).toBeGreaterThanOrEqual(10);
  });

  for (const file of files) {
    const name = relative(SRC_DIR, file);
    const code = stripComments(readFileSync(file, "utf8"));

    test(`${name} contains no external communication API`, () => {
      for (const { pattern, label } of FORBIDDEN_RUNTIME_PATTERNS) {
        const match = code.match(pattern);
        if (match) {
          throw new Error(`${name} contains forbidden ${label}: ${JSON.stringify(match[0])}`);
        }
      }
    });

    test(`${name} contains no URL outside the GitHub Release allowlist`, () => {
      const urls = code.match(/https?:\/\/[^\s"'`)]+/g) ?? [];

      for (const url of urls) {
        // Allowlist rather than blanket rejection: the generator legitimately
        // emits GitHub Release URLs into the generated installer text and the
        // resolver example help text, and the SPA links to the project's
        // license text and its static shields.io badge image.
        const allowed =
          url.startsWith("https://github.com/") ||
          url.startsWith("https://www.apache.org/") ||
          url.startsWith("https://img.shields.io/");
        if (!allowed) {
          throw new Error(`${name} contains a URL outside the allowlist: ${url}`);
        }
      }
    });
  }
});
