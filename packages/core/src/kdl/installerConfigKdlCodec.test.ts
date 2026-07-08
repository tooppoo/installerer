import { describe, expect, test } from "bun:test";

import { CANONICAL_KDL } from "./canonicalKdlFixture";
import {
  decodeInstallerConfigKdl,
  type DecodeInstallerConfigKdlResult,
} from "./installerConfigKdlCodec";
import { parseKdlText } from "./parseKdlText";

const WITHOUT_VERSION_KDL = `
installerer {
  source owner="tooppoo" repo="git-kura"

  binary name="git-kura" path-in-archive="git-kura"

  archive format="tar.gz" name-template="{repo}_{os}_{arch}.tar.gz" os-case="lowercase"

  checksum file-name="checksums.txt" algorithm="sha256"

  targets {
    target os="linux" arch="x86_64"
    target os="linux" arch="aarch64"
    target os="darwin" arch="x86_64"
    target os="darwin" arch="aarch64"
  }

  architecture-labels x86_64="x86_64" aarch64="aarch64"

  defaults install-dir="$HOME/.local/bin"
}
`;

const PER_OS_ARCHITECTURE_LABELS_KDL = `
installerer {
  source owner="tooppoo" repo="git-kura"

  binary name="git-kura" path-in-archive="git-kura"

  archive format="tar.gz" name-template="{repo}_{version}_{os}_{arch}.tar.gz" os-case="capitalized"

  checksum file-name="checksums.txt" algorithm="sha256"

  targets {
    target os="linux" arch="x86_64"
    target os="linux" arch="aarch64"
    target os="darwin" arch="x86_64"
    target os="darwin" arch="aarch64"
  }

  architecture-labels {
    linux x86_64="x86_64" aarch64="aarch64"
    darwin x86_64="amd64" aarch64="arm64"
  }

  defaults install-dir="$HOME/.local/bin"
}
`;

/** Minimal valid body: only the required nodes, every optional node omitted. */
const MINIMAL_KDL = wrap(`
  source owner="tooppoo" repo="git-kura"
  binary name="git-kura" path-in-archive="git-kura"
  archive format="tar.gz" name-template="{repo}_{os}_{arch}.tar.gz"
  checksum file-name="checksums.txt" algorithm="sha256"
  targets {
    target os="linux" arch="x86_64"
  }
`);

function wrap(body: string): string {
  return `installerer {\n${body}\n}\n`;
}

function decode(text: string): DecodeInstallerConfigKdlResult {
  const parsed = parseKdlText(text);
  if (!parsed.ok) {
    throw new Error(
      `expected KDL parse to succeed in test fixture: ${JSON.stringify(parsed.errors)}`,
    );
  }
  return decodeInstallerConfigKdl(parsed.document);
}

function expectOk(result: DecodeInstallerConfigKdlResult) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("unreachable");
  return result.input;
}

function expectErrors(result: DecodeInstallerConfigKdlResult) {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("unreachable");
  return result.errors;
}

describe("decodeInstallerConfigKdl: valid canonical shapes", () => {
  test("codecs the #99 canonical KDL example ({version} in archive.name-template)", () => {
    const input = expectOk(decode(CANONICAL_KDL));

    expect(input).toEqual({
      owner: "tooppoo",
      repo: "git-kura",
      binary: { name: "git-kura", pathInArchive: "git-kura" },
      archive: {
        format: "tar.gz",
        nameTemplate: "{repo}_{version}_{os}_{arch}.tar.gz",
        osCase: "lowercase",
      },
      checksum: { fileName: "checksums.txt", algorithm: "sha256" },
      targets: [
        { os: "linux", arch: "x86_64" },
        { os: "linux", arch: "aarch64" },
        { os: "darwin", arch: "x86_64" },
        { os: "darwin", arch: "aarch64" },
      ],
      architectureLabels: { x86_64: "x86_64", aarch64: "aarch64" },
      defaults: { installDir: "$HOME/.local/bin" },
    });
  });

  test("codecs an archive.name-template without {version}", () => {
    const input = expectOk(decode(WITHOUT_VERSION_KDL));

    expect((input.archive as { nameTemplate: string }).nameTemplate).toBe(
      "{repo}_{os}_{arch}.tar.gz",
    );
  });

  test("codecs the per-OS architecture-labels form", () => {
    const input = expectOk(decode(PER_OS_ARCHITECTURE_LABELS_KDL));

    expect(input.architectureLabels).toEqual({
      linux: { x86_64: "x86_64", aarch64: "aarch64" },
      darwin: { x86_64: "amd64", aarch64: "arm64" },
    });
  });

  test("codecs the flat architecture-labels form", () => {
    const input = expectOk(
      decode(
        wrap(`
          source owner="tooppoo" repo="git-kura"
          binary name="git-kura" path-in-archive="git-kura"
          archive format="tar.gz" name-template="{repo}_{os}_{arch}.tar.gz"
          checksum file-name="checksums.txt" algorithm="sha256"
          targets { target os="linux" arch="x86_64" }
          architecture-labels x86_64="amd64" aarch64="arm64"
        `),
      ),
    );

    expect(input.architectureLabels).toEqual({ x86_64: "amd64", aarch64: "arm64" });
  });

  test("omits archive.osCase from the input object when archive.os-case is omitted, deferring to existing config validation defaults", () => {
    const input = expectOk(decode(MINIMAL_KDL));

    expect(input.archive).toEqual({
      format: "tar.gz",
      nameTemplate: "{repo}_{os}_{arch}.tar.gz",
    });
  });

  test("omits architectureLabels from the input object when architecture-labels is omitted, deferring to existing config validation defaults", () => {
    const input = expectOk(decode(MINIMAL_KDL));

    expect("architectureLabels" in input).toBe(false);
  });

  test("omits defaults from the input object when defaults is omitted, deferring to existing config validation defaults", () => {
    const input = expectOk(decode(MINIMAL_KDL));

    expect("defaults" in input).toBe(false);
  });

  test("codecs an explicit defaults.install-dir", () => {
    const input = expectOk(
      decode(
        wrap(`
          source owner="tooppoo" repo="git-kura"
          binary name="git-kura" path-in-archive="git-kura"
          archive format="tar.gz" name-template="{repo}_{os}_{arch}.tar.gz"
          checksum file-name="checksums.txt" algorithm="sha256"
          targets { target os="linux" arch="x86_64" }
          defaults install-dir="/opt/git-kura/bin"
        `),
      ),
    );

    expect(input.defaults).toEqual({ installDir: "/opt/git-kura/bin" });
  });

  test("does not reject a node with an explicit empty child block, since kdljs cannot distinguish it from no block at all", () => {
    const withoutBlock = decode(
      wrap(`
        source owner="tooppoo" repo="git-kura"
        binary name="git-kura" path-in-archive="git-kura"
        archive format="tar.gz" name-template="{repo}_{os}_{arch}.tar.gz"
        checksum file-name="checksums.txt" algorithm="sha256"
        targets { target os="linux" arch="x86_64" }
      `),
    );
    const withEmptyBlock = decode(
      wrap(`
        source owner="tooppoo" repo="git-kura" {}
        binary name="git-kura" path-in-archive="git-kura"
        archive format="tar.gz" name-template="{repo}_{os}_{arch}.tar.gz"
        checksum file-name="checksums.txt" algorithm="sha256"
        targets { target os="linux" arch="x86_64" }
      `),
    );

    expect(withoutBlock.ok).toBe(true);
    expect(withEmptyBlock.ok).toBe(true);
    expect(withEmptyBlock).toEqual(withoutBlock);
  });
});

describe("decodeInstallerConfigKdl: root shape", () => {
  test("reports a required-root-missing error for an empty document", () => {
    const errors = expectErrors(decode(""));

    expect(errors).toContainEqual({
      path: "installerer",
      reason: "Required root node is missing.",
      expected: "a single installerer node",
    });
  });

  test("reports an error when the root is not a single installerer node (duplicate installerer)", () => {
    const errors = expectErrors(decode(`installerer {\n}\ninstallerer {\n}\n`));

    expect(errors).toContainEqual({
      path: "installerer",
      reason: "Root document must contain exactly one installerer node.",
      expected: "a single installerer node",
    });
  });

  test("reports an unknown-top-level-node error for a node alongside installerer", () => {
    const errors = expectErrors(decode(`${MINIMAL_KDL}extra-root 1\n`));

    expect(errors).toContainEqual({
      path: "extra-root",
      reason: "Unknown top-level node is not supported.",
      expected: "a single installerer node",
    });
  });

  test("rejects arguments on the installerer root node", () => {
    const errors = expectErrors(decode(`installerer "unexpected" {\n}\n`));

    expect(errors).toContainEqual({
      path: "installerer",
      reason: "Unexpected positional argument.",
      expected: "no positional arguments",
    });
  });

  test("rejects properties on the installerer root node", () => {
    const errors = expectErrors(decode(`installerer unexpected="x" {\n}\n`));

    expect(errors).toContainEqual({
      path: "installerer.unexpected",
      reason: "Unexpected property.",
      expected: "no properties",
    });
  });

  test("rejects a type annotation on the installerer root node", () => {
    const errors = expectErrors(decode(`(tag)installerer {\n}\n`));

    expect(errors).toContainEqual({
      path: "installerer",
      reason: "Unexpected type annotation.",
      expected: "no type annotation",
    });
  });

  test("rejects version-resolver as an ordinary unknown child node, not a special-cased one", () => {
    const errors = expectErrors(
      decode(
        wrap(`
          source owner="tooppoo" repo="git-kura"
          binary name="git-kura" path-in-archive="git-kura"
          archive format="tar.gz" name-template="{repo}_{os}_{arch}.tar.gz"
          checksum file-name="checksums.txt" algorithm="sha256"
          targets { target os="linux" arch="x86_64" }
          version-resolver "release_version_file"
        `),
      ),
    );

    expect(errors).toContainEqual({
      path: "installerer.version-resolver",
      reason: "Unknown child node is not supported.",
      expected: "one of: source, binary, archive, checksum, targets, architecture-labels, defaults",
    });
  });

  test("rejects an unknown child node under installerer", () => {
    const errors = expectErrors(decode(`${wrap("unexpected-child 1")}`));

    expect(errors).toContainEqual(
      expect.objectContaining({
        path: "installerer.unexpected-child",
        reason: "Unknown child node is not supported.",
      }),
    );
  });

  test("rejects a repeatable target node outside of targets", () => {
    const errors = expectErrors(
      decode(
        wrap(`
          source owner="tooppoo" repo="git-kura"
          binary name="git-kura" path-in-archive="git-kura"
          archive format="tar.gz" name-template="{repo}_{os}_{arch}.tar.gz"
          checksum file-name="checksums.txt" algorithm="sha256"
          targets { target os="linux" arch="x86_64" }
          target os="darwin" arch="aarch64"
        `),
      ),
    );

    expect(errors).toContainEqual(
      expect.objectContaining({
        path: "installerer.target",
        reason: "Unknown child node is not supported.",
      }),
    );
  });

  test("reports duplicate node errors for a duplicated singleton (source)", () => {
    const errors = expectErrors(
      decode(
        wrap(`
          source owner="tooppoo" repo="git-kura"
          source owner="other" repo="other-repo"
          binary name="git-kura" path-in-archive="git-kura"
          archive format="tar.gz" name-template="{repo}_{os}_{arch}.tar.gz"
          checksum file-name="checksums.txt" algorithm="sha256"
          targets { target os="linux" arch="x86_64" }
        `),
      ),
    );

    expect(errors).toContainEqual({
      path: "installerer.source",
      reason: "Duplicate node is not supported.",
      expected: "a single source node",
    });
  });

  test.each(["source", "binary", "archive", "checksum", "targets"])(
    "reports a required-node-missing error when %s is omitted",
    (nodeName) => {
      const bodies: Record<string, string> = {
        source: `source owner="tooppoo" repo="git-kura"`,
        binary: `binary name="git-kura" path-in-archive="git-kura"`,
        archive: `archive format="tar.gz" name-template="{repo}_{os}_{arch}.tar.gz"`,
        checksum: `checksum file-name="checksums.txt" algorithm="sha256"`,
        targets: `targets { target os="linux" arch="x86_64" }`,
      };
      const body = Object.entries(bodies)
        .filter(([name]) => name !== nodeName)
        .map(([, line]) => line)
        .join("\n");

      const errors = expectErrors(decode(wrap(body)));

      expect(errors).toContainEqual({
        path: `installerer.${nodeName}`,
        reason: "Required node is missing.",
        expected: `a single ${nodeName} node`,
      });
    },
  );
});

describe("decodeInstallerConfigKdl: leaf node shape (via source, representative of binary/archive/checksum/target/defaults)", () => {
  test("rejects an unknown property", () => {
    const errors = expectErrors(
      decode(wrap(`source owner="tooppoo" repo="git-kura" nickname="x"`)),
    );

    expect(errors).toContainEqual({
      path: "installerer.source.nickname",
      reason: "Unknown property is not supported.",
      expected: "one of: owner, repo",
    });
  });

  test("rejects an unexpected positional argument", () => {
    const errors = expectErrors(decode(wrap(`source owner="tooppoo" repo="git-kura" "extra"`)));

    expect(errors).toContainEqual({
      path: "installerer.source",
      reason: "Unexpected positional argument.",
      expected: "no positional arguments",
    });
  });

  test("rejects an unexpected non-empty child block", () => {
    const errors = expectErrors(
      decode(wrap(`source owner="tooppoo" repo="git-kura" {\n  nested 1\n}`)),
    );

    expect(errors).toContainEqual({
      path: "installerer.source",
      reason: "Unexpected child block.",
      expected: "no child block",
    });
  });

  test("rejects a node type annotation", () => {
    const errors = expectErrors(
      decode(wrap(`(unexpected-tag)source owner="tooppoo" repo="git-kura"`)),
    );

    expect(errors).toContainEqual({
      path: "installerer.source",
      reason: "Unexpected type annotation.",
      expected: "no type annotation",
    });
  });

  test("rejects a property value type annotation", () => {
    const errors = expectErrors(decode(wrap(`source owner=(str)"tooppoo" repo="git-kura"`)));

    expect(errors).toContainEqual({
      path: "installerer.source.owner",
      reason: "Unexpected type annotation.",
      expected: "no type annotation",
    });
  });

  test.each([
    ["number", `source owner=42 repo="git-kura"`],
    ["boolean", `source owner=#true repo="git-kura"`],
    ["null", `source owner=#null repo="git-kura"`],
  ])("rejects an unsupported scalar type (%s) where a string is expected", (_label, body) => {
    const errors = expectErrors(decode(wrap(body)));

    expect(errors).toContainEqual({
      path: "installerer.source.owner",
      reason: "Property value must be a string.",
      expected: "string",
    });
  });

  test("rejects a missing required property", () => {
    const errors = expectErrors(decode(wrap(`source repo="git-kura"`)));

    expect(errors).toContainEqual({
      path: "installerer.source.owner",
      reason: "Required property is missing.",
      expected: "string property",
    });
  });
});

describe("decodeInstallerConfigKdl: optional property shape (archive.os-case)", () => {
  test("rejects a type annotation on an optional property", () => {
    const errors = expectErrors(
      decode(
        wrap(`
          source owner="tooppoo" repo="git-kura"
          binary name="git-kura" path-in-archive="git-kura"
          archive format="tar.gz" name-template="{repo}_{os}_{arch}.tar.gz" os-case=(str)"lowercase"
          checksum file-name="checksums.txt" algorithm="sha256"
          targets { target os="linux" arch="x86_64" }
        `),
      ),
    );

    expect(errors).toContainEqual({
      path: "installerer.archive.os-case",
      reason: "Unexpected type annotation.",
      expected: "no type annotation",
    });
  });

  test("rejects an unsupported scalar type on an optional property", () => {
    const errors = expectErrors(
      decode(
        wrap(`
          source owner="tooppoo" repo="git-kura"
          binary name="git-kura" path-in-archive="git-kura"
          archive format="tar.gz" name-template="{repo}_{os}_{arch}.tar.gz" os-case=42
          checksum file-name="checksums.txt" algorithm="sha256"
          targets { target os="linux" arch="x86_64" }
        `),
      ),
    );

    expect(errors).toContainEqual({
      path: "installerer.archive.os-case",
      reason: "Property value must be a string.",
      expected: "string",
    });
  });
});

describe("decodeInstallerConfigKdl: targets", () => {
  test("assigns KDL-facing paths by position among target children", () => {
    const errors = expectErrors(
      decode(
        wrap(`
          source owner="tooppoo" repo="git-kura"
          binary name="git-kura" path-in-archive="git-kura"
          archive format="tar.gz" name-template="{repo}_{os}_{arch}.tar.gz"
          checksum file-name="checksums.txt" algorithm="sha256"
          targets {
            target os="linux" arch="x86_64"
            target arch="aarch64"
          }
        `),
      ),
    );

    expect(errors).toContainEqual({
      path: "installerer.targets.target[1].os",
      reason: "Required property is missing.",
      expected: "string property",
    });
  });

  test("requires at least one target node", () => {
    const errors = expectErrors(
      decode(
        wrap(`
          source owner="tooppoo" repo="git-kura"
          binary name="git-kura" path-in-archive="git-kura"
          archive format="tar.gz" name-template="{repo}_{os}_{arch}.tar.gz"
          checksum file-name="checksums.txt" algorithm="sha256"
          targets {
          }
        `),
      ),
    );

    expect(errors).toContainEqual({
      path: "installerer.targets",
      reason: "At least one target is required.",
      expected: "one or more target nodes",
    });
  });
});

describe("decodeInstallerConfigKdl: architecture-labels forms", () => {
  function withArchitectureLabels(archLabelsBody: string) {
    return wrap(`
      source owner="tooppoo" repo="git-kura"
      binary name="git-kura" path-in-archive="git-kura"
      archive format="tar.gz" name-template="{repo}_{os}_{arch}.tar.gz"
      checksum file-name="checksums.txt" algorithm="sha256"
      targets { target os="linux" arch="x86_64" }
      ${archLabelsBody}
    `);
  }

  test("rejects mixing the flat form and the per-OS child form on the same node", () => {
    const errors = expectErrors(
      decode(
        withArchitectureLabels(
          `architecture-labels x86_64="x86_64" {\n  linux x86_64="x86_64" aarch64="aarch64"\n}`,
        ),
      ),
    );

    expect(errors).toContainEqual({
      path: "installerer.architecture-labels",
      reason: "Flat architecture-labels properties and per-OS child nodes cannot be combined.",
      expected: "either flat x86_64/aarch64 properties, or linux/darwin child nodes, not both",
    });
  });

  test("rejects an unknown OS child node", () => {
    const errors = expectErrors(
      decode(withArchitectureLabels(`architecture-labels {\n  windows x86_64="x86_64"\n}`)),
    );

    expect(errors).toContainEqual({
      path: "installerer.architecture-labels.windows",
      reason: "Unknown child node is not supported.",
      expected: "one of: linux, darwin",
    });
  });

  test("rejects an unknown architecture property under a per-OS child node", () => {
    const errors = expectErrors(
      decode(withArchitectureLabels(`architecture-labels {\n  linux risc="v"\n}`)),
    );

    expect(errors).toContainEqual({
      path: "installerer.architecture-labels.linux.risc",
      reason: "Unknown property is not supported.",
      expected: "one of: x86_64, aarch64",
    });
  });

  test("rejects a duplicate per-OS child node", () => {
    const errors = expectErrors(
      decode(
        withArchitectureLabels(
          `architecture-labels {\n  linux x86_64="a" aarch64="b"\n  linux x86_64="c" aarch64="d"\n}`,
        ),
      ),
    );

    expect(errors).toContainEqual({
      path: "installerer.architecture-labels.linux",
      reason: "Duplicate node is not supported.",
      expected: "a single linux node",
    });
  });

  test("rejects a positional argument on a per-OS child node", () => {
    const errors = expectErrors(
      decode(
        withArchitectureLabels(`architecture-labels {\n  linux "unexpected" x86_64="x86_64"\n}`),
      ),
    );

    expect(errors).toContainEqual({
      path: "installerer.architecture-labels.linux",
      reason: "Unexpected positional argument.",
      expected: "no positional arguments",
    });
  });

  test("rejects a non-empty child block on a per-OS child node", () => {
    const errors = expectErrors(
      decode(
        withArchitectureLabels(
          `architecture-labels {\n  linux x86_64="x86_64" {\n    nested 1\n  }\n}`,
        ),
      ),
    );

    expect(errors).toContainEqual({
      path: "installerer.architecture-labels.linux",
      reason: "Unexpected child block.",
      expected: "no child block",
    });
  });
});
