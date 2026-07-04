export function renderInstallDir(): string {
  return `resolve_install_dir() {
  raw=$1
  # shellcheck disable=SC2088 # '$HOME'/'~' below are literal glob prefixes matched against $raw, then expanded manually via $HOME; the shell never expands them itself
  case "$raw" in
    '$HOME') printf '%s' "$HOME" ;;
    '$HOME/'*) printf '%s/%s' "$HOME" "\${raw#\\$HOME/}" ;;
    '~') printf '%s' "$HOME" ;;
    '~/'*) printf '%s/%s' "$HOME" "\${raw#\\~/}" ;;
    /*) printf '%s' "$raw" ;;
    *) printf '%s' "$raw" ;;
  esac
}

`;
}
