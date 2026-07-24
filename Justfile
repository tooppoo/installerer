
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

# Pilot reportage e2e alongside the Bun e2e; not in _check so hosts without reportage still pass `just check` — CI runs this as a dedicated step
[group('check')]
e2e:
  reportage

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

# release-prepare's rellog readiness check and version bumps are safety-critical, not just convenience: never run this with `--no-deps` / `JUST_NO_DEPS`, which would skip them.
[group('release')]
release version:
  rellog ready "{{ version }}"
  bun install --frozen-lockfile
  bun scripts/release.ts "{{ version }}"

[group('release')]
release-prepare version:
  rellog ready "{{ version }}"
  bun pm version "{{ version }}" --no-git-tag-version
  for dir in packages/* apps/*; do (cd "$dir" && bun pm version "{{ version }}" --no-git-tag-version) || exit 1; done
  git tag -a "{{ version }}" -m "Release {{ version }}"
