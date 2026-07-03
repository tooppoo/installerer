export function renderMain(): string {
  return `main() {
  version=
  install_dir_raw=$DEFAULT_INSTALL_DIR

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --help)
        usage
        exit 0
        ;;
      --version)
        [ "$#" -ge 2 ] || fail "--version requires a value"
        version=$2
        shift 2
        ;;
      --install-dir)
        [ "$#" -ge 2 ] || fail "--install-dir requires a value"
        install_dir_raw=$2
        shift 2
        ;;
      *)
        usage >&2
        fail "unknown argument: $1"
        ;;
    esac
  done

  [ "$version" != "latest" ] || fail "--version latest is ambiguous; omit --version for latest install"
  INSTALL_DIR=$(resolve_install_dir "$install_dir_raw")
  [ -n "$INSTALL_DIR" ] || fail "install directory must not be empty"
  validate_binary_path_in_archive "$BINARY_PATH_IN_ARCHIVE"
  check_runtime_dependencies

  if [ -n "$version" ]; then
    install_pin "$version"
  else
    install_latest
  fi
}

`;
}

export function renderUsage(): string {
  return `usage() {
  printf '%s\\n' "usage: $0 [--version <version>] [--install-dir <dir>]"
  printf '%s\\n' "       $0 --help"
}

`;
}

export function renderMainInvocation(): string {
  return `main "$@"
`;
}
