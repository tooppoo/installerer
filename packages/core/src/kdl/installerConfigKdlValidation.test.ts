import { describe, expect, test } from "bun:test";

import { CANONICAL_KDL } from "./canonicalKdlFixture";
import { parseKdlText } from "./parseKdlText";
import {
  validateInstallerConfigKdl,
  type ValidateInstallerConfigKdlResult,
} from "./installerConfigKdlValidation";

function validate(text: string): ValidateInstallerConfigKdlResult {
  const parsed = parseKdlText(text);
  if (!parsed.ok) {
    throw new Error(
      `expected KDL parse to succeed in test fixture: ${JSON.stringify(parsed.errors)}`,
    );
  }
  return validateInstallerConfigKdl(parsed.document);
}

describe("validateInstallerConfigKdl", () => {
  test("returns ok:true with the resolved InstallerConfig for the #99 canonical KDL example", () => {
    const result = validate(CANONICAL_KDL);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.config.owner).toBe("tooppoo");
    expect(result.config.repo).toBe("git-kura");
    expect(result.config.targets).toHaveLength(4);
    expect(result.archivePreviews.length).toBeGreaterThan(0);
  });

  test("reports codec-phase diagnostics with a KDL-facing path, without running semantic validation", () => {
    const result = validate(`
      installerer {
        source owner="tooppoo" repo="git-kura"
        binary name="git-kura" path-in-archive="git-kura"
        archive format="tar.gz" name-template="{repo}_{os}_{arch}.tar.gz"
        targets {
          target os="linux" arch="x86_64"
        }
      }
    `);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.diagnostics).toContainEqual({
      severity: "error",
      phase: "codec",
      path: "installerer.checksum",
      reason: "Required node is missing.",
      expected: "a single checksum node",
    });
  });

  test("reports semantic-phase diagnostics with a KDL-facing scalar path (source.owner)", () => {
    const result = validate(`
      installerer {
        source owner="-bad-owner" repo="git-kura"
        binary name="git-kura" path-in-archive="git-kura"
        archive format="tar.gz" name-template="{repo}_{os}_{arch}.tar.gz"
        checksum file-name="checksums.txt" algorithm="sha256"
        targets {
          target os="linux" arch="x86_64"
        }
      }
    `);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    const diagnostic = result.diagnostics.find((d) => d.path === "installerer.source.owner");
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.severity).toBe("error");
    expect(diagnostic?.phase).toBe("semantic");
  });

  test("reports semantic-phase diagnostics with a KDL-facing indexed target path", () => {
    const result = validate(`
      installerer {
        source owner="tooppoo" repo="git-kura"
        binary name="git-kura" path-in-archive="git-kura"
        archive format="tar.gz" name-template="{repo}_{os}_{arch}.tar.gz"
        checksum file-name="checksums.txt" algorithm="sha256"
        targets {
          target os="linux" arch="x86_64"
          target os="linux" arch="x86_64"
        }
      }
    `);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    const diagnostic = result.diagnostics.find((d) => d.path === "installerer.targets.target[1]");
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.phase).toBe("semantic");
    expect(diagnostic?.reason).toBe("Duplicate target entry.");
  });

  describe("returns warnings with a KDL-facing path, not the domain path validateInstallerConfig reports", () => {
    const result = validate(`
      installerer {
        source owner="tooppoo" repo="git-kura"
        binary name="git-kura" path-in-archive="git-kura"
        archive format="tar.gz" name-template="-{repo}_{version}_{os}_{arch}.tar.gz"
        checksum file-name="checksums.txt" algorithm="sha256"
        targets {
          target os="linux" arch="x86_64"
        }
      }
    `);
    if (!result.ok) throw new Error("unreachable");

    test("returns ok with at least one warning", () => {
      expect(result.ok).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    test.each([...result.warnings])("warning at $path uses a KDL-facing path", (warning) => {
      expect(warning.path).toStartWith("installerer.");
      expect(warning.path).not.toStartWith("$.");
    });

    test("reports the leading-dash filename warning at the KDL archive.name-template path", () => {
      expect(result.warnings).toContainEqual({
        path: "installerer.archive.name-template",
        reason:
          "Archive filename starts with '-'. The generated installer uses fixed local paths, but external tools may interpret this as an option.",
        recommended: "Prefix the filename with the repository or binary name.",
      });
    });
  });

  test("reports semantic-phase diagnostics with a KDL-facing flat architecture-labels path", () => {
    const result = validate(`
      installerer {
        source owner="tooppoo" repo="git-kura"
        binary name="git-kura" path-in-archive="git-kura"
        archive format="tar.gz" name-template="{repo}_{os}_{arch}.tar.gz"
        checksum file-name="checksums.txt" algorithm="sha256"
        targets {
          target os="linux" arch="x86_64"
        }
        architecture-labels x86_64="x86/64" aarch64="aarch64"
      }
    `);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    const diagnostic = result.diagnostics.find(
      (d) => d.path === "installerer.architecture-labels.x86_64",
    );
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.phase).toBe("semantic");
  });
});
