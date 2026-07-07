import { describe, expect, test } from "bun:test";

import { parseInstallerConfig, validateInstallerConfig } from "../../src/installerConfig";
import { generateInstaller } from "../../src/installerGenerator";
import { loadInvalidFixtures, loadValidFixtures } from "../helpers/fixtures";
import { matchInstallerSnapshot, normalizeGeneratedInstaller } from "../helpers/snapshot";
import { assertGeneratedInstallerContract } from "../helpers/staticAssertions";

const validFixtures = loadValidFixtures();
const invalidFixtures = loadInvalidFixtures();

describe("fixture-driven installer generation", () => {
  test("covers all four representative with-version/without-version x format combinations", () => {
    expect(validFixtures.map((fixture) => fixture.name)).toEqual([
      "with-version-tar-gz",
      "with-version-zip",
      "without-version-tar-gz",
      "without-version-zip",
    ]);
  });

  for (const fixture of validFixtures) {
    describe(fixture.name, () => {
      const result = parseInstallerConfig(fixture.json);

      test("accepts the fixture without errors or warnings", () => {
        expect(result.ok).toBe(true);
        expect(result.warnings).toEqual([]);
      });

      if (!result.ok) {
        return;
      }

      const script = generateInstaller(result.config);
      const normalized = normalizeGeneratedInstaller(script);

      test("matches the committed generated-installer snapshot", () => {
        // Update only for intentional code generation changes:
        // bun run test:update-snapshots
        matchInstallerSnapshot(fixture.name, normalized);
      });

      test("satisfies the generated installer static assertions", () => {
        assertGeneratedInstallerContract(normalized, {
          archiveFormat: result.config.archive.format,
          hasVersionPlaceholder: result.config.archive.nameTemplate.includes("{version}"),
        });
      });

      test("produces archive filename previews for every target", () => {
        expect(result.archivePreviews).toHaveLength(result.config.targets.length);
        for (const preview of result.archivePreviews) {
          expect(preview.latestName.length).toBeGreaterThan(0);
        }
      });
    });
  }
});

describe("fixture-driven rejection paths", () => {
  test("fixtures cover every user-visible failure category", () => {
    const covered = new Set(invalidFixtures.map((fixture) => fixture.category));

    expect([...covered].sort()).toEqual([
      "archive-format",
      "contextual-validation",
      "path-filename-safety",
      "schema",
      "template",
    ]);
  });

  for (const fixture of invalidFixtures) {
    test(`${fixture.category}/${fixture.name} is rejected with classified errors`, () => {
      const result = validateInstallerConfig(fixture.config);

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }

      for (const expected of fixture.expectedErrors) {
        const match = result.errors.find(
          (error) => error.path === expected.path && error.reason.includes(expected.reasonIncludes),
        );

        if (!match) {
          throw new Error(
            `Fixture ${fixture.category}/${fixture.name} expected an error at ${expected.path} ` +
              `containing ${JSON.stringify(expected.reasonIncludes)}, got: ` +
              JSON.stringify(result.errors, null, 2),
          );
        }

        // Every reported error carries a field path, reason, and expectation.
        expect(match.path.startsWith("$")).toBe(true);
        expect(match.reason.length).toBeGreaterThan(0);
      }
    });
  }

  test("malformed JSON input is rejected at the document root", () => {
    const result = parseInstallerConfig("{ not json");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.path).toBe("$");
    }
  });
});
