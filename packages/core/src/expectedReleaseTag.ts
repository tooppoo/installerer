import {
  archiveFormatSuffix,
  countPlaceholderOccurrences,
  expandArchiveNameTemplate,
  hasArchiveFilenameHardChars,
  parseArchiveNameTemplate,
  splitTemplateAtPlaceholder,
  type ArchiveFormat,
} from "./archiveTemplate";
import { isValidGitTagName } from "./installerConfig";
import type { OsCase, TargetArch, TargetOS } from "./installerConfig";
import type { ValidationError } from "./validation";

/**
 * `checksum-index` mirrors the checksum file the generated installer fetches
 * from `/releases/latest/download/{checksum.fileName}` as a version-resolution
 * index (issue #111); `archive-filename` is a single candidate name a user
 * observed directly (e.g. on the GitHub Releases page).
 */
export type ExpectedReleaseTagCheckSource =
  | { kind: "checksum-index"; text: string }
  | { kind: "archive-filename"; fileName: string };

export type ExpectedReleaseTagCheckInput = {
  archiveNameTemplate: string;
  archiveFormat: ArchiveFormat;
  osCase: OsCase;
  owner: string;
  repo: string;
  bin: string;
  target: { os: TargetOS; arch: TargetArch };
  /** Resolved `asset_arch_label` for `target.arch` (from `config.architectureLabels`). */
  assetArchLabel: string;
  source: ExpectedReleaseTagCheckSource;
};

export type ExpectedReleaseTagCheckResult =
  | {
      ok: true;
      expectedTag: string;
      archiveAssetName: string;
      prefix: string;
      suffix: string;
    }
  | { ok: false; reason: "malformed-template"; errors: ValidationError[] }
  | { ok: false; reason: "template-has-no-version" }
  | { ok: false; reason: "no-match"; prefix: string; suffix: string }
  | { ok: false; reason: "ambiguous"; candidates: string[]; prefix: string; suffix: string }
  | { ok: false; reason: "invalid-git-tag"; candidate: string }
  | { ok: false; reason: "unsafe-filename-tag"; candidate: string };

/**
 * Offline, pure re-implementation of the checksum-index-based tag extraction
 * the generated installer performs at runtime for `{version}` archive
 * templates (issue #111). Never fetches anything: callers supply pasted
 * checksum-file text or a single observed archive filename. Used by the Web
 * UI's "expected release tag" panel and reusable from the CLI.
 */
export function checkExpectedReleaseTag(
  input: ExpectedReleaseTagCheckInput,
): ExpectedReleaseTagCheckResult {
  const templateResult = parseArchiveNameTemplate(input.archiveNameTemplate);
  if (!templateResult.ok) {
    return { ok: false, reason: "malformed-template", errors: templateResult.errors };
  }
  const { segments } = templateResult;

  if (countPlaceholderOccurrences(segments, "version") === 0) {
    return { ok: false, reason: "template-has-no-version" };
  }

  const split = splitTemplateAtPlaceholder(segments, "version");
  if (!split) {
    return { ok: false, reason: "template-has-no-version" };
  }

  const values = {
    owner: input.owner,
    repo: input.repo,
    bin: input.bin,
    version: "",
    os: input.target.os,
    arch: input.assetArchLabel,
    osCase: input.osCase,
  };
  const prefix = expandArchiveNameTemplate(split.before, values);
  const suffix = expandArchiveNameTemplate(split.after, values);
  const expectedSuffix = archiveFormatSuffix(input.archiveFormat);

  const matches = (fileName: string) =>
    fileName.startsWith(prefix) &&
    fileName.endsWith(suffix) &&
    fileName.length >= prefix.length + suffix.length &&
    fileName.endsWith(expectedSuffix);

  let matched: string;
  if (input.source.kind === "archive-filename") {
    if (!matches(input.source.fileName)) {
      return { ok: false, reason: "no-match", prefix, suffix };
    }
    matched = input.source.fileName;
  } else {
    const candidates = [
      ...new Set(
        input.source.text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .map((line) => line.split(/\s+/)[1])
          .filter((fileName): fileName is string => fileName !== undefined && matches(fileName)),
      ),
    ];

    if (candidates.length === 0) {
      return { ok: false, reason: "no-match", prefix, suffix };
    }
    if (candidates.length > 1) {
      return { ok: false, reason: "ambiguous", candidates, prefix, suffix };
    }
    matched = candidates[0] as string;
  }

  const candidate = matched.slice(prefix.length, matched.length - suffix.length);

  if (!isValidGitTagName(candidate)) {
    return { ok: false, reason: "invalid-git-tag", candidate };
  }
  if (hasArchiveFilenameHardChars(candidate)) {
    return { ok: false, reason: "unsafe-filename-tag", candidate };
  }

  return { ok: true, expectedTag: candidate, archiveAssetName: matched, prefix, suffix };
}
