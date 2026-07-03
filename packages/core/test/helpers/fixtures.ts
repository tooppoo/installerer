import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const FIXTURES_DIR = join(import.meta.dir, "..", "fixtures");

/**
 * Fixture categories mirror the user-visible failure reasons from issue #10,
 * not internal module boundaries. Adding a directory outside this list fails
 * the integration test on purpose.
 */
export const INVALID_FIXTURE_CATEGORIES = [
  "schema",
  "template",
  "contextual-validation",
  "resolver",
  "archive-format",
  "path-filename-safety",
] as const;

export type InvalidFixtureCategory = (typeof INVALID_FIXTURE_CATEGORIES)[number];

export type ValidFixture = {
  /** Fixture file name without extension; also names the snapshot file. */
  name: string;
  /** Raw JSON text, fed through parseInstallerConfig to cover the JSON path. */
  json: string;
};

export type InvalidFixture = {
  category: InvalidFixtureCategory;
  name: string;
  description: string;
  config: unknown;
  expectedErrors: Array<{
    path: string;
    reasonIncludes: string;
  }>;
};

export function loadValidFixtures(): ValidFixture[] {
  const dir = join(FIXTURES_DIR, "valid");

  return listJsonFiles(dir).map((file) => ({
    name: file.replace(/\.json$/, ""),
    json: readFileSync(join(dir, file), "utf8"),
  }));
}

export function loadInvalidFixtures(): InvalidFixture[] {
  const dir = join(FIXTURES_DIR, "invalid");
  const categories = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const known = new Set<string>(INVALID_FIXTURE_CATEGORIES);
  const unknown = categories.filter((category) => !known.has(category));

  if (unknown.length > 0) {
    throw new Error(
      `Unknown invalid-fixture categories: ${unknown.join(", ")}. ` +
        `Classify fixtures by user-visible failure reason (${INVALID_FIXTURE_CATEGORIES.join(", ")}).`,
    );
  }

  return categories.flatMap((category) =>
    listJsonFiles(join(dir, category)).map((file) => {
      const parsed = JSON.parse(readFileSync(join(dir, category, file), "utf8")) as {
        description?: string;
        config?: unknown;
        expectedErrors?: Array<{ path: string; reasonIncludes: string }>;
      };

      if (!parsed.config || !parsed.expectedErrors || parsed.expectedErrors.length === 0) {
        throw new Error(
          `Invalid fixture ${category}/${file} must define "config" and non-empty "expectedErrors".`,
        );
      }

      return {
        category: category as InvalidFixtureCategory,
        name: file.replace(/\.json$/, ""),
        description: parsed.description ?? "",
        config: parsed.config,
        expectedErrors: parsed.expectedErrors,
      };
    }),
  );
}

function listJsonFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort();
}
