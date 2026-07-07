
default: check

[group('check')]
check: _check fmt
[group('check')]
check-fix: _check fmt-fix

[group('check')]
[group('fmt')]
fmt:
  bun run format:check
[group('check')]
[group('fmt')]
fmt-fix:
  bun run format

[private]
_check:
  bun install --frozen-lockfile
  bun run docs:check
  bun run lint
  bun run check:boundaries
  bun test --coverage
  bun run build
  bun run typecheck
  bun run shellcheck:generated

[group('release')]
binary-release-artifacts:
  bun install --frozen-lockfile
  bun run build:binary
  bun run release:binary

[group('release')]
release version:
  rellog ready {{ version }}
  bun install --frozen-lockfile
  bun scripts/release.ts
