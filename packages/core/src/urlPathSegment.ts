// packages/core typechecks with no DOM/Node/Bun ambient types (issue #100),
// so the WHATWG Encoding API global — provided by every supported runtime
// (browsers, Node.js >= 22, Bun) but not part of ECMAScript's own lib — is
// declared module-locally with just the surface used here.
declare const TextEncoder: new () => { encode(input: string): Uint8Array };

/**
 * Percent-encodes one URL path segment. Shared by `installerDiagnostics.ts`
 * (Release asset/checksum/version-file URL previews) and
 * `installCommandExamples.ts` (the standard curl install command's raw
 * GitHub URL) so both apply the same encoding rule to `owner`/`repo`/asset
 * names.
 */
export function urlEncodePathSegment(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let encoded = "";

  for (const byte of bytes) {
    if (isUnreservedUrlByte(byte)) {
      encoded += String.fromCharCode(byte);
    } else {
      encoded += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }

  return encoded;
}

function isUnreservedUrlByte(byte: number) {
  return (
    (byte >= 0x30 && byte <= 0x39) ||
    (byte >= 0x41 && byte <= 0x5a) ||
    (byte >= 0x61 && byte <= 0x7a) ||
    byte === 0x2d ||
    byte === 0x2e ||
    byte === 0x5f ||
    byte === 0x7e
  );
}
