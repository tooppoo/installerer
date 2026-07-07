import { describe, expect, test } from "bun:test";
import {
  countPlaceholderOccurrences,
  expandArchiveNameTemplate,
  parseArchiveNameTemplate,
  splitTemplateAtPlaceholder,
} from "./archiveTemplate";

describe("countPlaceholderOccurrences", () => {
  test("counts zero when the placeholder is absent", () => {
    const result = parseArchiveNameTemplate("{repo}_{os}_{arch}.tar.gz");
    if (!result.ok) throw new Error("expected ok");
    expect(countPlaceholderOccurrences(result.segments, "version")).toBe(0);
  });

  test("counts one occurrence", () => {
    const result = parseArchiveNameTemplate("{repo}_{version}_{os}_{arch}.tar.gz");
    if (!result.ok) throw new Error("expected ok");
    expect(countPlaceholderOccurrences(result.segments, "version")).toBe(1);
  });
});

describe("parseArchiveNameTemplate {version} occurrence limit", () => {
  test("rejects a template with {version} twice", () => {
    const result = parseArchiveNameTemplate("{repo}_{version}_{os}_{version}.tar.gz");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.reason).toContain("{version} must occur zero or one times");
  });

  test("accepts a template with {version} once", () => {
    const result = parseArchiveNameTemplate("{repo}_{version}_{os}.tar.gz");
    expect(result.ok).toBe(true);
  });

  test("accepts a template with no {version}", () => {
    const result = parseArchiveNameTemplate("{repo}_{os}.tar.gz");
    expect(result.ok).toBe(true);
  });
});

describe("splitTemplateAtPlaceholder", () => {
  test("returns undefined when the placeholder is absent", () => {
    const result = parseArchiveNameTemplate("{repo}_{os}_{arch}.tar.gz");
    if (!result.ok) throw new Error("expected ok");
    expect(splitTemplateAtPlaceholder(result.segments, "version")).toBeUndefined();
  });

  test("splits around the single occurrence, expanding before/after independently", () => {
    const result = parseArchiveNameTemplate("{repo}_{version}_{os}_{arch}.tar.gz");
    if (!result.ok) throw new Error("expected ok");
    const split = splitTemplateAtPlaceholder(result.segments, "version");
    if (!split) throw new Error("expected a split");

    const values = {
      owner: "owner",
      repo: "rellog",
      bin: "rellog",
      version: "",
      os: "linux" as const,
      arch: "x86_64",
      osCase: "lowercase" as const,
    };
    expect(expandArchiveNameTemplate(split.before, values)).toBe("rellog_");
    expect(expandArchiveNameTemplate(split.after, values)).toBe("_linux_x86_64.tar.gz");
  });

  test("splits with the placeholder at the very start or end", () => {
    const startResult = parseArchiveNameTemplate("{version}_{os}.tar.gz");
    if (!startResult.ok) throw new Error("expected ok");
    const startSplit = splitTemplateAtPlaceholder(startResult.segments, "version");
    if (!startSplit) throw new Error("expected a split");
    expect(startSplit.before).toHaveLength(0);

    const endResult = parseArchiveNameTemplate("{os}_{version}");
    if (!endResult.ok) throw new Error("expected ok");
    const endSplit = splitTemplateAtPlaceholder(endResult.segments, "version");
    if (!endSplit) throw new Error("expected a split");
    expect(endSplit.after).toHaveLength(0);
  });
});
