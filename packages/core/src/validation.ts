export type ValidationError = {
  path: string;
  reason: string;
  expected?: string;
};

export type JsonObject = Record<string, unknown>;

export function requireObject(
  value: unknown,
  path: string,
  errors: ValidationError[],
): JsonObject | undefined {
  if (isJsonObject(value)) {
    return value;
  }

  errors.push({
    path,
    reason: value === undefined ? "Required field is missing." : "Value must be an object.",
    expected: "object",
  });
  return undefined;
}

export function requireString(
  value: unknown,
  path: string,
  errors: ValidationError[],
): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  errors.push({
    path,
    reason: value === undefined ? "Required field is missing." : "Value must be a string.",
    expected: "string",
  });
  return undefined;
}

export function rejectUnknownFields(
  object: JsonObject,
  path: string,
  allowedFields: string[],
  errors: ValidationError[],
) {
  const allowed = new Set(allowedFields);

  for (const field of Object.keys(object)) {
    if (!allowed.has(field)) {
      errors.push({
        path: `${path}.${field}`,
        reason: "Unknown field is not supported.",
        expected: `one of: ${allowedFields.join(", ")}`,
      });
    }
  }
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isAscii(value: string) {
  return /^[\x20-\x7e]*$/.test(value);
}
