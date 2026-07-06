import { describe, expect, test } from "bun:test";

import { CANONICAL_KDL } from "./canonicalKdlFixture";
import { parseKdlText } from "./parseKdlText";

describe("parseKdlText", () => {
  test("returns ok:true with the parsed document for the #99 canonical KDL example", () => {
    const result = parseKdlText(CANONICAL_KDL);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.document).toHaveLength(1);
    expect(result.document[0]?.name).toBe("installerer");
  });

  test("returns ok:false with a syntax-phase error for malformed KDL text", () => {
    const result = parseKdlText(`node "unterminated`);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.phase).toBe("syntax");
    expect(typeof result.errors[0]?.message).toBe("string");
  });

  test("attaches a source location to syntax errors when kdljs reports a token position", () => {
    const result = parseKdlText(`node "unterminated`);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.errors[0]?.location).toEqual({ line: 1, column: 6, offset: 5 });
  });

  test("preserves the original kdljs error object as `cause` for later diagnostics formatting", () => {
    const result = parseKdlText(`node "unterminated`);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.errors[0]?.cause).toBeDefined();
  });

  test("omits location for EOF-anchored syntax errors, where kdljs reports non-finite (NaN) token positions", () => {
    const result = parseKdlText(`installerer {`);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.errors[0]?.location).toBeUndefined();
  });

  test("does not throw and normalizes to ok:false when kdljs itself throws (e.g. non-string input)", () => {
    expect(() => {
      const result = parseKdlText(null as unknown as string);
      expect(result.ok).toBe(false);
    }).not.toThrow();
  });

  test("rejects bare KDL 1.0.0 keyword literals, confirming kdljs@0.3.0 targets KDL 2.0.0 (`#true`/`#false`/`#null`)", () => {
    const result = parseKdlText(`node true`);

    expect(result.ok).toBe(false);
  });

  test("accepts KDL 2.0.0 keyword literals", () => {
    const result = parseKdlText(`node #true #false #null`);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.document[0]?.values).toEqual([true, false, null]);
  });
});
