import { describe, expect, test } from "bun:test";
import path from "node:path";

type ReleaseArtifactsManifestTarget = {
  readonly os: string;
  readonly arch: string;
  readonly archive: string;
  readonly archive_files: readonly { readonly path: string; readonly dest: string }[];
};

type ReleaseArtifactsManifest = {
  readonly archive_prefix: string;
  readonly build_dist: string;
  readonly version_command: string;
  readonly targets: readonly ReleaseArtifactsManifestTarget[];
};

const repoRoot = path.join(import.meta.dir, "..", "..");
const manifest: ReleaseArtifactsManifest = await Bun.file(
  path.join(repoRoot, ".github", "release-artifacts.json"),
).json();

// wf-cross-platform-build derives the public archive name directly from this manifest's os/arch fields, so a typo here would silently ship a release that violates the fixed archive-name contract.
// See docs/adr/20260703T091000Z_cli-distribution-policy.md.
const EXPECTED_OS_ARCH_PAIRS = ["Linux/x86_64", "Linux/arm64", "Darwin/x86_64", "Darwin/arm64"];

describe("release-artifacts manifest", () => {
  test("uses the installerer archive prefix", () => {
    expect(manifest.archive_prefix).toBe("installerer");
  });

  test("declares exactly the ADR-mandated OS/arch targets", () => {
    const pairs = manifest.targets.map((target) => `${target.os}/${target.arch}`);
    expect(pairs.sort()).toEqual([...EXPECTED_OS_ARCH_PAIRS].sort());
  });

  test.each([...manifest.targets])(
    "packages $os/$arch as a tar.gz containing only the installerer executable",
    (target) => {
      expect(target.archive).toBe("tar.gz");
      expect(target.archive_files).toEqual([
        { path: `${manifest.build_dist}/installerer`, dest: "installerer" },
      ]);
    },
  );

  // wf-cross-platform-build's "Package archive" step runs `rm -rf dist` as its own scratch-directory setup, so build_dist must not live under dist/ or the freshly built binary is deleted before it can be archived.
  test("keeps build output outside the reusable workflow's dist/ scratch directory", () => {
    expect(manifest.build_dist).not.toMatch(/^dist(\/|$)/);
  });

  // wf-cross-platform-build's own fallback (stripping "v" off $GITHUB_REF_NAME) breaks on non-tag refs, such as the "<pr>/merge" ref ci.yml's build-only run uses, so version_command must always be set.
  test("resolves the version from package.json rather than the git ref", async () => {
    expect(manifest.version_command).toBe("scripts/release/print-version.sh");
    expect(await Bun.file(path.join(repoRoot, manifest.version_command)).exists()).toBe(true);
  });
});
