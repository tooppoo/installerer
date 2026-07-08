import { describe, expect, test } from "bun:test";

import { domainPathToKdlFacingPath } from "./installerConfigKdlPathMapping";

describe("domainPathToKdlFacingPath", () => {
  test.each([
    ["$.owner", "installerer.source.owner"],
    ["$.repo", "installerer.source.repo"],
    ["$.binary", "installerer.binary"],
    ["$.binary.name", "installerer.binary.name"],
    ["$.binary.pathInArchive", "installerer.binary.path-in-archive"],
    ["$.archive", "installerer.archive"],
    ["$.archive.format", "installerer.archive.format"],
    ["$.archive.nameTemplate", "installerer.archive.name-template"],
    ["$.archive.osCase", "installerer.archive.os-case"],
    ["$.checksum", "installerer.checksum"],
    ["$.checksum.fileName", "installerer.checksum.file-name"],
    ["$.checksum.algorithm", "installerer.checksum.algorithm"],
    ["$.targets", "installerer.targets"],
    ["$.targets[0]", "installerer.targets.target[0]"],
    ["$.targets[3]", "installerer.targets.target[3]"],
    ["$.targets[0].os", "installerer.targets.target[0].os"],
    ["$.targets[0].arch", "installerer.targets.target[0].arch"],
    ["$.architectureLabels", "installerer.architecture-labels"],
    ["$.architectureLabels.x86_64", "installerer.architecture-labels.x86_64"],
    ["$.architectureLabels.aarch64", "installerer.architecture-labels.aarch64"],
    ["$.architectureLabels.linux", "installerer.architecture-labels.linux"],
    ["$.architectureLabels.linux.x86_64", "installerer.architecture-labels.linux.x86_64"],
    ["$.architectureLabels.linux.aarch64", "installerer.architecture-labels.linux.aarch64"],
    ["$.architectureLabels.darwin", "installerer.architecture-labels.darwin"],
    ["$.architectureLabels.darwin.x86_64", "installerer.architecture-labels.darwin.x86_64"],
    ["$.architectureLabels.darwin.aarch64", "installerer.architecture-labels.darwin.aarch64"],
    ["$.defaults", "installerer.defaults"],
    ["$.defaults.installDir", "installerer.defaults.install-dir"],
  ])("maps %s to %s", (domainPath, kdlPath) => {
    expect(domainPathToKdlFacingPath(domainPath)).toBe(kdlPath);
  });

  test("falls back to the domain path unchanged for an unmapped path", () => {
    expect(domainPathToKdlFacingPath("$.somethingNew")).toBe("$.somethingNew");
  });

  test("falls back to the domain path unchanged for the JSON-only root path", () => {
    expect(domainPathToKdlFacingPath("$")).toBe("$");
  });
});
