export function renderFail(): string {
  return `fail() {
  printf '%s\\n' "installerer: $*" >&2
  exit 1
}

`;
}
