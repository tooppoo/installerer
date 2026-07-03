import { describe, expect, test } from "bun:test";

import {
  ARCHITECTURE_LABEL_PRESETS,
  ASSET_ARCH_LABEL_PATTERN,
  CANONICAL_ARCHITECTURES,
  DEFAULT_ARCHITECTURE_LABELS,
  validateAssetArchLabel,
} from "./architectureLabels";
import type { ValidationError } from "./validation";

describe("static architecture label definitions", () => {
  test("CANONICAL_ARCHITECTURES lists exactly x86_64 and aarch64", () => {
    expect(CANONICAL_ARCHITECTURES).toEqual(["x86_64", "aarch64"]);
  });

  test("ARCHITECTURE_LABEL_PRESETS offers the representative spellings per architecture", () => {
    expect(ARCHITECTURE_LABEL_PRESETS).toEqual({
      x86_64: ["amd64", "x86_64"],
      aarch64: ["arm64", "aarch64"],
    });
  });

  test("DEFAULT_ARCHITECTURE_LABELS maps each canonical architecture to itself (OS-reported name, not GOARCH)", () => {
    expect(DEFAULT_ARCHITECTURE_LABELS).toEqual({ x86_64: "x86_64", aarch64: "aarch64" });
  });

  test.each([...CANONICAL_ARCHITECTURES])(
    "default label for %s is itself a valid preset",
    (arch) => {
      expect(ARCHITECTURE_LABEL_PRESETS[arch]).toContain(DEFAULT_ARCHITECTURE_LABELS[arch]);
    },
  );
});

describe("ASSET_ARCH_LABEL_PATTERN", () => {
  test.each(["amd64", "x86_64", "arm64-v8a", "x64", "universal", "a.b_c+d-e"])(
    "accepts safe label %j",
    (value) => {
      expect(ASSET_ARCH_LABEL_PATTERN.test(value)).toBe(true);
    },
  );

  test.each(["arm/64", "arm\\64", "arm 64", "arm\n64", "arm\0" + "64"])(
    "rejects unsafe character in %j",
    (value) => {
      expect(ASSET_ARCH_LABEL_PATTERN.test(value)).toBe(false);
    },
  );
});

describe("validateAssetArchLabel", () => {
  test.each(["amd64", "x86_64", "arm64-v8a", "universal"])(
    "accepts safe non-empty label %j",
    (value) => {
      const errors: ValidationError[] = [];
      validateAssetArchLabel(value, "$.architectureLabels.x86_64", errors);
      expect(errors).toEqual([]);
    },
  );

  test("rejects empty string", () => {
    const errors: ValidationError[] = [];
    validateAssetArchLabel("", "$.architectureLabels.x86_64", errors);
    expect(errors).toHaveLength(1);
  });

  test.each([".", ".."])("rejects %j even though it matches the character class", (value) => {
    const errors: ValidationError[] = [];
    validateAssetArchLabel(value, "$.architectureLabels.x86_64", errors);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.reason).toBe("Value is not a safe architecture label.");
  });

  test.each(["arm/64", "arm\\64", "arm 64", "arm\0" + "64"])(
    "rejects path separators, whitespace, or NUL in %j",
    (value) => {
      const errors: ValidationError[] = [];
      validateAssetArchLabel(value, "$.architectureLabels.aarch64", errors);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.path).toBe("$.architectureLabels.aarch64");
    },
  );
});
