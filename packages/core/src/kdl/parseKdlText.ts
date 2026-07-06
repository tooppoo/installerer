import { parse } from "kdljs";
import type { Document, Node, Value } from "kdljs";

/**
 * Re-exported so callers never need to import `kdljs` directly; the
 * dependency stays contained to this wrapper (docs/adr/20260704T103600Z).
 */
export type { Document as KdlDocument, Node as KdlNode, Value as KdlValue };

export type KdlSourceLocation = {
  line: number;
  column: number;
  offset: number;
};

export type KdlSyntaxError = {
  /** syntax parse failure, as opposed to codec/semantic failures added by later layers */
  phase: "syntax";
  message: string;
  location: KdlSourceLocation | undefined;
  /** original kdljs/chevrotain error object, kept for #107 diagnostics formatting */
  cause: unknown;
};

export type ParseKdlTextResult =
  | { ok: true; document: Document }
  | { ok: false; errors: KdlSyntaxError[] };

interface RawParseErrorLike {
  message?: unknown;
  token?: {
    startLine?: unknown;
    startColumn?: unknown;
    startOffset?: unknown;
  };
}

/**
 * Normalizes `kdljs`'s parse behavior into an installerer-owned Result.
 *
 * `kdljs@0.3.0`'s `parse()` reports syntax errors via its return value, but
 * it does throw for some malformed inputs (e.g. a non-string argument), so
 * this wrapper also guards against that to keep raw thrown errors from
 * reaching callers.
 */
export function parseKdlText(text: string): ParseKdlTextResult {
  let raw: ReturnType<typeof parse>;

  try {
    raw = parse(text);
  } catch (cause) {
    return { ok: false, errors: [toUnexpectedFailure(cause)] };
  }

  if (raw.output === undefined || raw.errors.length > 0) {
    return { ok: false, errors: raw.errors.map(toKdlSyntaxError) };
  }

  return { ok: true, document: raw.output };
}

function toKdlSyntaxError(cause: unknown): KdlSyntaxError {
  const like = cause as RawParseErrorLike;
  const token = like.token;
  const location =
    Number.isFinite(token?.startLine) &&
    Number.isFinite(token?.startColumn) &&
    Number.isFinite(token?.startOffset)
      ? {
          line: token?.startLine as number,
          column: token?.startColumn as number,
          offset: token?.startOffset as number,
        }
      : undefined;

  return {
    phase: "syntax",
    message: typeof like.message === "string" ? like.message : "KDL syntax parse failed.",
    location,
    cause,
  };
}

function toUnexpectedFailure(cause: unknown): KdlSyntaxError {
  return {
    phase: "syntax",
    message: cause instanceof Error ? cause.message : "KDL syntax parse failed unexpectedly.",
    location: undefined,
    cause,
  };
}
