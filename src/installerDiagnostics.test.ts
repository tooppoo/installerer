import { describe, expect, test } from "bun:test";

import { validateInstallerConfig } from "./installerConfig";
import { buildInstallerDiagnostics, urlEncodePathSegment } from "./installerDiagnostics";

const baseConfig = {
  owner: "tooppoo",
  repo: "rellog",
  binary: {
    name: "rellog",
    pathInArchive: "rellog",
  },
  versionResolver: {
    type: "release_version_file",
    fileName: "VERSION",
  },
  archive: {
    format: "tar.gz",
    nameTemplate: "{repo}_{version}_{os}_{arch}.tar.gz",
  },
  checksum: {
    fileName: "checksums.txt",
    algorithm: "sha256",
  },
  targets: [
    { os: "linux", arch: "x86_64" },
    { os: "darwin", arch: "arm64" },
  ],
  defaults: {
    installDir: "$HOME/.local/bin",
  },
} as const;

describe("urlEncodePathSegment", () => {
  test("encodes one URL path segment with the generated installer rule", () => {
    expect(urlEncodePathSegment("release/v1.2.3")).toBe("release%2Fv1.2.3");
    expect(urlEncodePathSegment("asset#1.tar.gz")).toBe("asset%231.tar.gz");
    expect(urlEncodePathSegment("über.tar.gz")).toBe("%C3%BCber.tar.gz");
  });
});

describe("buildInstallerDiagnostics", () => {
  test("builds release_version_file helper previews from validated config output", () => {
    const result = validateInstallerConfig(baseConfig);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const diagnostics = buildInstallerDiagnostics(result.config, result.archivePreviews);
    expect(diagnostics.typoCommands).toContain(
      "curl -fsIL https://github.com/tooppoo/rellog/releases/latest/download/VERSION >/dev/null",
    );
    expect(diagnostics.expectedReleaseAssets).toEqual([
      "VERSION",
      "checksums.txt",
      "rellog_v1.2.3_linux_x86_64.tar.gz",
      "rellog_v1.2.3_darwin_arm64.tar.gz",
    ]);
    expect(diagnostics.urls.latest).toEqual([
      "https://github.com/tooppoo/rellog/releases/latest/download/VERSION",
      "https://github.com/tooppoo/rellog/releases/download/v1.2.3/checksums.txt",
      "https://github.com/tooppoo/rellog/releases/download/v1.2.3/rellog_v1.2.3_linux_x86_64.tar.gz",
      "https://github.com/tooppoo/rellog/releases/download/v1.2.3/rellog_v1.2.3_darwin_arm64.tar.gz",
    ]);
    expect(diagnostics.urls.pinned[0]).toBe(
      "https://github.com/tooppoo/rellog/releases/download/v0.1.2/checksums.txt",
    );
    expect(diagnostics.installCommands.invalid).toEqual(["sh install.sh --version latest"]);
  });

  test("builds latest_asset helper previews without a VERSION asset", () => {
    const result = validateInstallerConfig({
      ...baseConfig,
      versionResolver: { type: "latest_asset" },
      archive: {
        format: "tar.gz",
        nameTemplate: "{repo}_{os}_{arch}#asset.tar.gz",
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const diagnostics = buildInstallerDiagnostics(result.config, result.archivePreviews);
    expect(diagnostics.expectedReleaseAssets).toEqual([
      "checksums.txt",
      "rellog_linux_x86_64#asset.tar.gz",
      "rellog_darwin_arm64#asset.tar.gz",
    ]);
    expect(diagnostics.urls.latest).toContain(
      "https://github.com/tooppoo/rellog/releases/latest/download/rellog_linux_x86_64%23asset.tar.gz",
    );
    expect(diagnostics.typoCommands).toContain(
      "curl -fsIL https://github.com/tooppoo/rellog/releases/latest/download/rellog_linux_x86_64%23asset.tar.gz >/dev/null",
    );
    expect(diagnostics.urls.latest).not.toContain(
      "https://github.com/tooppoo/rellog/releases/latest/download/VERSION",
    );
  });
});
