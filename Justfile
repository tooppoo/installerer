
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

# reportage is pre-1.0, so minor releases may change DSL/config semantics; the e2e suite is written and reviewed against exactly this version (see docs/adr/20260724T013426Z_reportage-e2e-pilot-for-generated-installer.md)
REPORTAGE_VERSION := "0.0.6"

# Pilot reportage e2e alongside the Bun e2e; not in _check so hosts without reportage still pass `just check` — CI runs this as a dedicated step
[group('check')]
e2e-reportage:
  @reportage --version | grep -qxF "reportage {{ REPORTAGE_VERSION }}" || { printf '%s\n' "e2e-reportage requires reportage {{ REPORTAGE_VERSION }}, got: $(reportage --version 2>/dev/null || echo 'reportage not installed')" >&2; exit 1; }
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
