/**
 * Quotes a value as a single-quoted POSIX shell literal.
 */
export function shellLiteral(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
