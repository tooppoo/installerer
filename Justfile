
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
  bun run lint
  bun run check:boundaries
  bun test --coverage
  bun run build
  bun run typecheck
  bun run shellcheck:generated

binary-release-artifacts:
  bun install --frozen-lockfile
  bun run build:binary
  bun run release:binary

release:
  bun install --frozen-lockfile
  bun scripts/release.ts
