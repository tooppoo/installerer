
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
  bun run docs:check
  bun test --coverage
  bun run build
  bun run build:npm
  bun run typecheck
  bun run typecheck:cli
