export function renderMain(): string {
  return `main() {
  version=
  install_dir_raw=$DEFAULT_INSTALL_DIR
  saw_version=0
  saw_install_dir=0
  saw_requirements=0
  saw_check_requirements=0

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --help)
        usage
        exit 0
        ;;
      --version)
        [ "$#" -ge 2 ] || fail "--version requires a value"
        version=$2
        saw_version=1
        shift 2
        ;;
      --install-dir)
        [ "$#" -ge 2 ] || fail "--install-dir requires a value"
        install_dir_raw=$2
        saw_install_dir=1
        shift 2
        ;;
      --requirements)
        saw_requirements=1
        shift
        ;;
      --check-requirements)
        saw_check_requirements=1
        shift
        ;;
      *)
        usage >&2
        fail "unknown argument: $1"
        ;;
    esac
  done

  if [ "$saw_requirements" -eq 1 ] || [ "$saw_check_requirements" -eq 1 ]; then
    if [ "$saw_version" -eq 1 ] || [ "$saw_install_dir" -eq 1 ]; then
      fail "--requirements/--check-requirements must not be combined with --version/--install-dir"
    fi
    [ "$saw_requirements" -eq 0 ] || print_requirements
    if [ "$saw_check_requirements" -eq 1 ]; then
      check_requirements
      exit $?
    fi
    exit 0
  fi

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
  printf '%s\\n' "       $0 --requirements [--check-requirements]"
  printf '%s\\n' "       $0 --check-requirements"
  printf '%s\\n' "       $0 --help"
}

`;
}

export function renderMainInvocation(): string {
  return `main "$@"
`;
}
