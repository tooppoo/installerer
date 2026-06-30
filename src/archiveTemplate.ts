import type { TargetArch, TargetOS } from "./installerConfig";
import type { ValidationError } from "./validation";

export type ArchiveFormat = "tar.gz" | "zip";
export type ArchivePlaceholder = "owner" | "repo" | "bin" | "version" | "os" | "arch" | "target";

export type ArchiveTemplateSegment =
  | {
      type: "literal";
      value: string;
    }
  | {
      type: "placeholder";
      name: ArchivePlaceholder;
    };

export type ArchiveTemplateWarning = {
  path: string;
  reason: string;
  recommended: string;
};

export type ArchiveNamePreview = {
  os: TargetOS;
  arch: TargetArch;
  latestName: string;
  pinnedName: string;
  warnings: ArchiveTemplateWarning[];
};

const ALLOWED_PLACEHOLDERS = new Set<ArchivePlaceholder>([
  "owner",
  "repo",
  "bin",
  "version",
  "os",
  "arch",
  "target",
]);
export const ARCHIVE_FILENAME_HARD_CHARS = /[\/\\\s\x00-\x1f\x7f]/;
const ARCHIVE_FILENAME_WARNING_CHARS = /['"`$;&|<>()\[\]*?~#]/;

export function parseArchiveNameTemplate(
  template: string,
  path = "$.archive.nameTemplate",
): { ok: true; segments: ArchiveTemplateSegment[] } | { ok: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const segments: ArchiveTemplateSegment[] = [];
  let literalStart = 0;
  let index = 0;

  while (index < template.length) {
    const char = template[index];

    if (char === "}") {
      errors.push({
        path,
        reason: "Malformed archive filename template: unmatched closing brace.",
        expected: "literal text or {owner}, {repo}, {bin}, {version}, {os}, {arch}, {target}",
      });
      return { ok: false, errors };
    }

    if (char !== "{") {
      index += 1;
      continue;
    }

    if (literalStart < index) {
      segments.push({ type: "literal", value: template.slice(literalStart, index) });
    }

    const closeIndex = template.indexOf("}", index + 1);
    if (closeIndex === -1) {
      errors.push({
        path,
        reason: "Malformed archive filename template: unmatched opening brace.",
        expected: "close placeholders with }",
      });
      return { ok: false, errors };
    }

    const name = template.slice(index + 1, closeIndex);
    if (name.length === 0) {
      errors.push({
        path,
        reason: "Malformed archive filename template: empty placeholder.",
        expected: "one of {owner}, {repo}, {bin}, {version}, {os}, {arch}, {target}",
      });
      return { ok: false, errors };
    }

    if (name.includes("{") || name.includes("}")) {
      errors.push({
        path,
        reason: "Malformed archive filename template: nested braces are not supported.",
        expected: "single-pass placeholders such as {repo}",
      });
      return { ok: false, errors };
    }

    if (!ALLOWED_PLACEHOLDERS.has(name as ArchivePlaceholder)) {
      errors.push({
        path,
        reason: `Unknown archive filename placeholder: {${name}}.`,
        expected: "{owner} | {repo} | {bin} | {version} | {os} | {arch} | {target}",
      });
      return { ok: false, errors };
    }

    segments.push({ type: "placeholder", name: name as ArchivePlaceholder });
    index = closeIndex + 1;
    literalStart = index;
  }

  if (literalStart < template.length) {
    segments.push({ type: "literal", value: template.slice(literalStart) });
  }

  return { ok: true, segments };
}

export function templateUsesPlaceholder(segments: ArchiveTemplateSegment[], name: ArchivePlaceholder) {
  return segments.some(segment => segment.type === "placeholder" && segment.name === name);
}

export function expandArchiveNameTemplate(
  segments: ArchiveTemplateSegment[],
  values: {
    owner: string;
    repo: string;
    bin: string;
    version: string;
    os: TargetOS;
    arch: TargetArch;
  },
) {
  return segments
    .map(segment => {
      if (segment.type === "literal") {
        return segment.value;
      }

      if (segment.name === "bin") {
        return values.bin;
      }

      if (segment.name === "target") {
        return `${values.os}_${values.arch}`;
      }

      return values[segment.name];
    })
    .join("");
}

export function archiveFormatSuffix(format: ArchiveFormat) {
  return format === "tar.gz" ? ".tar.gz" : ".zip";
}

export function validateArchiveFilename(
  value: string,
  format: ArchiveFormat,
  path = "$.archive.nameTemplate",
): { errors: ValidationError[]; warnings: ArchiveTemplateWarning[] } {
  const errors: ValidationError[] = [];
  const warnings: ArchiveTemplateWarning[] = [];
  const expectedSuffix = archiveFormatSuffix(format);

  if (value.length === 0) {
    errors.push({
      path,
      reason: "Archive filename must not be empty.",
      expected: `filename ending with ${expectedSuffix}`,
    });
  }

  if (ARCHIVE_FILENAME_HARD_CHARS.test(value)) {
    errors.push({
      path,
      reason: "Archive filename must not contain path separators, whitespace, or control characters.",
      expected: "a single GitHub Release asset filename",
    });
  }

  if (!value.endsWith(expectedSuffix)) {
    errors.push({
      path,
      reason: "Archive filename suffix does not match archive.format.",
      expected: expectedSuffix,
    });
  }

  warnings.push(...archiveFilenameWarnings(value, path));
  return { errors, warnings };
}

function archiveFilenameWarnings(value: string, path: string): ArchiveTemplateWarning[] {
  const warnings: ArchiveTemplateWarning[] = [];

  if (value.startsWith("-")) {
    warnings.push({
      path,
      reason: "Archive filename starts with '-'. The generated installer uses fixed local paths, but external tools may interpret this as an option.",
      recommended: "Prefix the filename with the repository or binary name.",
    });
  }

  if (value.startsWith(".")) {
    warnings.push({
      path,
      reason: "Archive filename starts with '.'. Hidden-style asset names are easy to miss in local tooling.",
      recommended: "Prefix the filename with the repository or binary name.",
    });
  }

  if (value.endsWith(".")) {
    warnings.push({
      path,
      reason: "Archive filename ends with '.'. Some tools and filesystems handle trailing dots inconsistently.",
      recommended: "End the filename with the archive suffix only.",
    });
  }

  if (!/^[\x00-\x7f]*$/.test(value)) {
    warnings.push({
      path,
      reason: "Archive filename contains non-ASCII characters. The installer percent-encodes URL path segments, but older tools can display these inconsistently.",
      recommended: "Use ASCII letters, digits, '.', '_', and '-'.",
    });
  }

  if (ARCHIVE_FILENAME_WARNING_CHARS.test(value)) {
    warnings.push({
      path,
      reason: "Archive filename contains shell-metacharacter-looking characters. The installer quotes values, but the name is harder to audit.",
      recommended: "Use ASCII letters, digits, '.', '_', and '-'.",
    });
  }

  return warnings;
}
