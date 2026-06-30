
default:
  @just check

check:
  @just _check
  bun run format:check

check-fix:
  @just _check
  bun run format

_check:
  bun install --frozen-lockfile
  bun test
  bun run build
  bun run typecheck
