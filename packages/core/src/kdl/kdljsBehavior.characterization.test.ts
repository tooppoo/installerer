import { describe, expect, test } from "bun:test";
import { parse } from "kdljs";

import { CANONICAL_KDL } from "./canonicalKdlFixture";

/**
 * These tests pin `kdljs@0.3.0`'s own parse behavior directly (not through
 * our wrapper). They exist so an upstream `kdljs` version bump surfaces any
 * AST/behavior drift as a failing test here, before it can silently affect
 * the future KDL codec (#108).
 *
 * Scope note: this file documents *kdljs* behavior only. Rejecting
 * canonical-subset violations (unknown nodes, unexpected arguments/
 * properties, duplicate targets, etc.) is installerer's own responsibility,
 * per docs/adr/20260704T103600Z_kdl-as-canonical-config-format.md; several
 * tests below show that `kdljs` happily parses such input, which is why
 * that layer is needed.
 */

describe("kdljs@0.3.0 raw parse behavior", () => {
  test("parses the #99 canonical KDL example with no errors", () => {
    const result = parse(CANONICAL_KDL);

    expect(result.errors).toEqual([]);
    expect(result.output).toBeDefined();
  });

  test("represents the document root as an array of nodes, not a single wrapper node", () => {
    const result = parse(CANONICAL_KDL);

    expect(Array.isArray(result.output)).toBe(true);
    expect(result.output).toHaveLength(1);
  });

  test("exposes the node name as a plain string on `name`", () => {
    const result = parse(CANONICAL_KDL);

    expect(result.output?.[0]?.name).toBe("installerer");
  });

  test("represents positional arguments as an ordered array on `values`", () => {
    const result = parse(`version-resolver "release_version_file"`);

    expect(result.output?.[0]?.values).toEqual(["release_version_file"]);
  });

  test("represents properties as a plain key-value record on `properties`", () => {
    const result = parse(`source owner="tooppoo" repo="git-kura"`);

    expect(result.output?.[0]?.properties).toEqual({ owner: "tooppoo", repo: "git-kura" });
  });

  test("represents a children block as a nested Document array on `children`", () => {
    const result = parse(`targets {
      target os="linux" arch="x86_64"
    }`);

    const targets = result.output?.[0];
    expect(targets?.children).toHaveLength(1);
    expect(targets?.children[0]?.name).toBe("target");
    expect(targets?.children[0]?.properties).toEqual({ os: "linux", arch: "x86_64" });
  });

  test("represents a node with no children block as an empty array, indistinguishable from an empty block", () => {
    const withoutBlock = parse(`source owner="tooppoo"`);
    const withEmptyBlock = parse(`source owner="tooppoo" {}`);

    expect(withoutBlock.output?.[0]?.children).toEqual([]);
    expect(withEmptyBlock.output?.[0]?.children).toEqual([]);
  });

  test("represents a node type annotation (tag) as `tags.name`", () => {
    const result = parse(`(release-version-file)version-resolver "VERSION"`);

    expect(result.output?.[0]?.tags.name).toBe("release-version-file");
  });

  test("represents a node with no type annotation as `tags.name === undefined`", () => {
    const result = parse(`source owner="tooppoo"`);

    expect(result.output?.[0]?.tags.name).toBeUndefined();
  });

  test("represents argument/property type annotations positionally in `tags.values`/`tags.properties`", () => {
    const result = parse(`node (u8)123 key=(str)"v"`);

    const node = result.output?.[0];
    expect(node?.values).toEqual([123]);
    expect(node?.tags.values).toEqual(["u8"]);
    expect(node?.properties).toEqual({ key: "v" });
    expect(node?.tags.properties).toEqual({ key: "str" });
  });

  test("maps string/number/boolean/null scalars directly to their JS equivalents", () => {
    const result = parse(`node "str" 42 3.14 #true #false #null`);

    expect(result.output?.[0]?.values).toEqual(["str", 42, 3.14, true, false, null]);
  });

  test("rejects bare `true`/`false`/`null` (KDL 1.0.0 keyword syntax) as a syntax error", () => {
    const result = parse(`node true`);

    expect(result.output).toBeUndefined();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("reports syntax errors via the return value, never by throwing, and attaches a source token position", () => {
    let thrown: unknown;
    let result: ReturnType<typeof parse> | undefined;

    try {
      result = parse(`node "unterminated`);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeUndefined();
    expect(result?.output).toBeUndefined();
    expect(result?.errors).toHaveLength(1);
    const error = result?.errors[0];
    expect(typeof error?.message).toBe("string");
    expect(error?.token?.startLine).toBe(1);
    expect(error?.token?.startColumn).toBe(6);
    expect(error?.token?.startOffset).toBe(5);
  });

  test('reports `NaN` (typeof "number", but not finite) token position fields for EOF-anchored syntax errors, e.g. an unclosed children block', () => {
    const result = parse(`installerer {`);

    expect(result.output).toBeUndefined();
    expect(result.errors).toHaveLength(1);
    const token = result.errors[0]?.token;
    expect(typeof token?.startLine).toBe("number");
    expect(Number.isNaN(token?.startLine)).toBe(true);
    expect(Number.isNaN(token?.startColumn)).toBe(true);
    expect(Number.isNaN(token?.startOffset)).toBe(true);
  });

  test("does throw for some malformed non-KDL-text inputs, e.g. a non-string argument", () => {
    expect(() => parse(null as unknown as string)).toThrow();
  });

  test("silently overwrites duplicate properties on the same node with the last value (last-write-wins)", () => {
    const result = parse(`node a=1 a=2 a=3`);

    expect(result.errors).toEqual([]);
    expect(result.output?.[0]?.properties).toEqual({ a: 3 });
  });

  test("duplicate properties are not detectable from the AST: the discarded values are not retained anywhere", () => {
    const result = parse(`node a=1 a=2`);
    const node = result.output?.[0];

    expect(node?.properties).toEqual({ a: 2 });
    expect(Object.keys(node?.properties ?? {})).toEqual(["a"]);
  });

  test("parses an argument/property/child outside the installerer canonical subset without any error (subset enforcement is installerer's own responsibility)", () => {
    const unexpectedArgument = parse(
      `binary name="git-kura" path-in-archive="git-kura" "unexpected"`,
    );
    const unexpectedProperty = parse(
      `binary name="git-kura" path-in-archive="git-kura" unexpected="x"`,
    );
    const unknownChild = parse(
      `binary name="git-kura" path-in-archive="git-kura" { unexpected-child 1 }`,
    );
    const unexpectedTag = parse(
      `(unexpected-tag)binary name="git-kura" path-in-archive="git-kura"`,
    );

    expect(unexpectedArgument.errors).toEqual([]);
    expect(unexpectedArgument.output?.[0]?.values).toEqual(["unexpected"]);

    expect(unexpectedProperty.errors).toEqual([]);
    expect(unexpectedProperty.output?.[0]?.properties.unexpected).toBe("x");

    expect(unknownChild.errors).toEqual([]);
    expect(unknownChild.output?.[0]?.children[0]?.name).toBe("unexpected-child");

    expect(unexpectedTag.errors).toEqual([]);
    expect(unexpectedTag.output?.[0]?.tags.name).toBe("unexpected-tag");
  });

  test("allows more than one root node; a single canonical `installerer` root is installerer's own constraint, not kdljs's", () => {
    const result = parse(`installerer {\n}\nextra-root 1\n`);

    expect(result.errors).toEqual([]);
    expect(result.output).toHaveLength(2);
  });
});
