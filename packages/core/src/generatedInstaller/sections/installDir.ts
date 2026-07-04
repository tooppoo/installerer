export function renderInstallDir(): string {
  return `resolve_install_dir() {
  raw=$1
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
