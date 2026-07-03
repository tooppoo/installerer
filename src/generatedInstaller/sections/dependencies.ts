export function renderDependencies(): string {
  return `require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

check_runtime_dependencies() {
  require_command uname
  require_command mktemp
  require_command rm
  require_command mkdir
  require_command cp
  require_command mv
  require_command chmod
  require_command curl
  require_command awk
  require_command grep
  require_command od
  require_command tr
  require_command cut
  require_command ls
  case "$ARCHIVE_FORMAT" in
    tar.gz) require_command tar ;;
    zip) require_command unzip ;;
    *) fail "unsupported archive format: $ARCHIVE_FORMAT" ;;
  esac
  if command -v sha256sum >/dev/null 2>&1; then
    CHECKSUM_COMMAND=sha256sum
  elif command -v shasum >/dev/null 2>&1; then
    CHECKSUM_COMMAND=shasum
  else
    fail "sha256sum or shasum is required"
  fi
}

`;
}
