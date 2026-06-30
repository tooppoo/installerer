
default:
  @just check

check fix="false" :
  bun install --frozen-lockfile
  bun test
  bun run build
  {{ if fix == "true" { "bun run format" } else { "bun run format:check" } }}
  bun run typecheck
