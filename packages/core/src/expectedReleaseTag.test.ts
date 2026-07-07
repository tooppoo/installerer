import { describe, expect, test } from "bun:test";
import { checkExpectedReleaseTag, type ExpectedReleaseTagCheckInput } from "./expectedReleaseTag";

const baseInput: ExpectedReleaseTagCheckInput = {
  archiveNameTemplate: "{repo}_{version}_{os}_{arch}.tar.gz",
  archiveFormat: "tar.gz",
  osCase: "lowercase",
  owner: "tooppoo",
  repo: "rellog",
  bin: "rellog",
  target: { os: "linux", arch: "x86_64" },
  assetArchLabel: "x86_64",
  source: { kind: "archive-filename", fileName: "rellog_v1.2.3_linux_x86_64.tar.gz" },
};

describe("checkExpectedReleaseTag", () => {
  test("extracts the expected tag from a single archive filename", () => {
    const result = checkExpectedReleaseTag(baseInput);
    expect(result).toEqual({
      ok: true,
      expectedTag: "v1.2.3",
      archiveAssetName: "rellog_v1.2.3_linux_x86_64.tar.gz",
      prefix: "rellog_",
      suffix: "_linux_x86_64.tar.gz",
    });
  });

  test("extracts the expected tag from a pasted checksum index, ignoring other targets", () => {
    const result = checkExpectedReleaseTag({
      ...baseInput,
      source: {
        kind: "checksum-index",
        text: [
          "aaaa  rellog_v1.2.3_darwin_aarch64.tar.gz",
          "bbbb  rellog_v1.2.3_linux_x86_64.tar.gz",
          "",
        ].join("\n"),
      },
    });
    expect(result).toEqual({
      ok: true,
      expectedTag: "v1.2.3",
      archiveAssetName: "rellog_v1.2.3_linux_x86_64.tar.gz",
      prefix: "rellog_",
      suffix: "_linux_x86_64.tar.gz",
    });
  });

  test("dedupes an identical filename appearing on multiple checksum lines", () => {
    const result = checkExpectedReleaseTag({
      ...baseInput,
      source: {
        kind: "checksum-index",
        text: [
          "aaaa  rellog_v1.2.3_linux_x86_64.tar.gz",
          "aaaa  rellog_v1.2.3_linux_x86_64.tar.gz",
        ].join("\n"),
      },
    });
    expect(result.ok).toBe(true);
  });

  test("reports template-has-no-version when the template omits {version}", () => {
    const result = checkExpectedReleaseTag({
      ...baseInput,
      archiveNameTemplate: "{repo}_{os}_{arch}.tar.gz",
    });
    expect(result).toEqual({ ok: false, reason: "template-has-no-version" });
  });

  test("reports malformed-template for an invalid template", () => {
    const result = checkExpectedReleaseTag({ ...baseInput, archiveNameTemplate: "{nope}" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error");
    expect(result.reason).toBe("malformed-template");
  });

  test("reports no-match when nothing fits the prefix/suffix", () => {
    const result = checkExpectedReleaseTag({
      ...baseInput,
      source: { kind: "archive-filename", fileName: "other_v1.2.3_linux_x86_64.tar.gz" },
    });
    expect(result).toEqual({
      ok: false,
      reason: "no-match",
      prefix: "rellog_",
      suffix: "_linux_x86_64.tar.gz",
    });
  });

  test("reports ambiguous when two distinct filenames both match", () => {
    const result = checkExpectedReleaseTag({
      ...baseInput,
      source: {
        kind: "checksum-index",
        text: [
          "aaaa  rellog_v1.2.3_linux_x86_64.tar.gz",
          "bbbb  rellog_v1.2.4_linux_x86_64.tar.gz",
        ].join("\n"),
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error");
    expect(result.reason).toBe("ambiguous");
    if (result.reason !== "ambiguous") throw new Error("expected ambiguous");
    expect(result.candidates.sort()).toEqual(
      ["rellog_v1.2.3_linux_x86_64.tar.gz", "rellog_v1.2.4_linux_x86_64.tar.gz"].sort(),
    );
  });

  test("reports invalid-git-tag when the extracted candidate is not a valid tag", () => {
    const result = checkExpectedReleaseTag({
      ...baseInput,
      source: { kind: "archive-filename", fileName: "rellog_..12.3_linux_x86_64.tar.gz" },
    });
    expect(result).toEqual({ ok: false, reason: "invalid-git-tag", candidate: "..12.3" });
  });

  test('reports invalid-git-tag when the extracted candidate is exactly "latest"', () => {
    // Mirrors the generated installer's is_valid_git_tag, which special-cases
    // this literal string the same way --version latest is rejected.
    const result = checkExpectedReleaseTag({
      ...baseInput,
      source: { kind: "archive-filename", fileName: "rellog_latest_linux_x86_64.tar.gz" },
    });
    expect(result).toEqual({ ok: false, reason: "invalid-git-tag", candidate: "latest" });
  });

  test("reports unsafe-filename-tag when the extracted candidate contains a slash", () => {
    const result = checkExpectedReleaseTag({
      ...baseInput,
      source: { kind: "archive-filename", fileName: "rellog_release/v1.2.3_linux_x86_64.tar.gz" },
    });
    expect(result).toEqual({
      ok: false,
      reason: "unsafe-filename-tag",
      candidate: "release/v1.2.3",
    });
  });
});
