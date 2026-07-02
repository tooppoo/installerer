import {
  archiveFormatSuffix,
  expandArchiveNameTemplate,
  parseArchiveNameTemplate,
  validateArchiveFilename,
  type ArchiveTemplateSegment,
} from "./archiveTemplate";
import type { InstallerConfig, TargetArch, TargetOS } from "./installerConfig";

export function generateInstaller(config: InstallerConfig): string {
  const template = parseArchiveNameTemplate(config.archive.nameTemplate);
  if (!template.ok) {
    throw new Error(template.errors.map((error) => `${error.path}: ${error.reason}`).join("\n"));
  }

  return `#!/bin/sh
set -u

if [ "\${DEBUG:-}" = "1" ]; then
  set -x
fi

OWNER=${shellLiteral(config.owner)}
REPO=${shellLiteral(config.repo)}
BINARY_NAME=${shellLiteral(config.binary.name)}
BINARY_PATH_IN_ARCHIVE=${shellLiteral(config.binary.pathInArchive)}
CHECKSUM_FILE_NAME=${shellLiteral(config.checksum.fileName)}
DEFAULT_INSTALL_DIR=${shellLiteral(config.defaults.installDir)}
INSTALL_DIR=
ARCHIVE_FORMAT=${shellLiteral(config.archive.format)}
ARCHIVE_SUFFIX=${shellLiteral(archiveFormatSuffix(config.archive.format))}
${config.versionResolver.type === "release_version_file" ? `VERSION_FILE_NAME=${shellLiteral(config.versionResolver.fileName)}` : ""}
LF='
'
CR=$(printf '\\r')

main() {
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

fail() {
  printf '%s\\n' "installerer: $*" >&2
  exit 1
}

usage() {
  printf '%s\\n' "usage: $0 [--version <version>] [--install-dir <dir>]"
  printf '%s\\n' "       $0 --help"
}

require_command() {
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

url_encode_segment() {
  value=$1
  encoded=
  hex_bytes=$(LC_ALL=C printf '%s' "$value" | od -An -tx1 -v | tr -d ' \\n')

  while [ -n "$hex_bytes" ]; do
    byte=$(printf '%s' "$hex_bytes" | cut -c 1-2)
    hex_bytes=$(printf '%s' "$hex_bytes" | cut -c 3-)
    case "$byte" in
      2d) encoded="$encoded-" ;;
      2e) encoded="$encoded." ;;
      5f) encoded="$encoded"_ ;;
      7e) encoded="$encoded~" ;;
      30) encoded="$encoded"0 ;;
      31) encoded="$encoded"1 ;;
      32) encoded="$encoded"2 ;;
      33) encoded="$encoded"3 ;;
      34) encoded="$encoded"4 ;;
      35) encoded="$encoded"5 ;;
      36) encoded="$encoded"6 ;;
      37) encoded="$encoded"7 ;;
      38) encoded="$encoded"8 ;;
      39) encoded="$encoded"9 ;;
      41) encoded="$encoded"A ;;
      42) encoded="$encoded"B ;;
      43) encoded="$encoded"C ;;
      44) encoded="$encoded"D ;;
      45) encoded="$encoded"E ;;
      46) encoded="$encoded"F ;;
      47) encoded="$encoded"G ;;
      48) encoded="$encoded"H ;;
      49) encoded="$encoded"I ;;
      4a) encoded="$encoded"J ;;
      4b) encoded="$encoded"K ;;
      4c) encoded="$encoded"L ;;
      4d) encoded="$encoded"M ;;
      4e) encoded="$encoded"N ;;
      4f) encoded="$encoded"O ;;
      50) encoded="$encoded"P ;;
      51) encoded="$encoded"Q ;;
      52) encoded="$encoded"R ;;
      53) encoded="$encoded"S ;;
      54) encoded="$encoded"T ;;
      55) encoded="$encoded"U ;;
      56) encoded="$encoded"V ;;
      57) encoded="$encoded"W ;;
      58) encoded="$encoded"X ;;
      59) encoded="$encoded"Y ;;
      5a) encoded="$encoded"Z ;;
      61) encoded="$encoded"a ;;
      62) encoded="$encoded"b ;;
      63) encoded="$encoded"c ;;
      64) encoded="$encoded"d ;;
      65) encoded="$encoded"e ;;
      66) encoded="$encoded"f ;;
      67) encoded="$encoded"g ;;
      68) encoded="$encoded"h ;;
      69) encoded="$encoded"i ;;
      6a) encoded="$encoded"j ;;
      6b) encoded="$encoded"k ;;
      6c) encoded="$encoded"l ;;
      6d) encoded="$encoded"m ;;
      6e) encoded="$encoded"n ;;
      6f) encoded="$encoded"o ;;
      70) encoded="$encoded"p ;;
      71) encoded="$encoded"q ;;
      72) encoded="$encoded"r ;;
      73) encoded="$encoded"s ;;
      74) encoded="$encoded"t ;;
      75) encoded="$encoded"u ;;
      76) encoded="$encoded"v ;;
      77) encoded="$encoded"w ;;
      78) encoded="$encoded"x ;;
      79) encoded="$encoded"y ;;
      7a) encoded="$encoded"z ;;
      *) encoded="$encoded%$(printf '%s' "$byte" | tr 'abcdef' 'ABCDEF')" ;;
    esac
  done

  printf '%s' "$encoded"
}

is_valid_git_tag() {
  tag=$1
  case "$tag" in
    ""|latest|/*|*/|*.|@|*//*|*..*|*@{*|*~*|*^*|*:*|*\\?*|*\\**|*\\[*|*\\\\*) return 1 ;;
    *"$CR"*|*"$LF"*) return 1 ;;
  esac
  if LC_ALL=C printf '%s' "$tag" | grep -q '[[:cntrl:][:space:]]'; then
    return 1
  fi
  old_ifs=$IFS
  IFS=/
  set -- $tag
  IFS=$old_ifs
  for segment do
    case "$segment" in
      ""|.*|*.lock) return 1 ;;
    esac
  done
  return 0
}
${
  config.versionResolver.type === "release_version_file"
    ? `
read_version_file() {
  url=$1
  content=$(curl -fsSL "$url" && printf x) || fail "failed to resolve latest version from $url"
  content=\${content%x}
  case "$content" in
    *"$CR$LF") content=\${content%"$CR$LF"} ;;
    *"$LF") content=\${content%"$LF"} ;;
  esac
  [ -n "$content" ] || fail "VERSION file is empty"
  case "$content" in
    *"$CR"*|*"$LF"*) fail "VERSION file must contain a single line" ;;
  esac
  printf '%s' "$content"
}
`
    : ""
}
validate_archive_asset_name() {
  name=$1
  [ -n "$name" ] || fail "archive filename is empty"
  case "$name" in
    */*|*\\\\*) fail "archive filename contains a path separator: $name" ;;
  esac
  if LC_ALL=C printf '%s' "$name" | grep '[[:cntrl:][:space:]]' >/dev/null; then
    fail "archive filename contains whitespace or control characters: $name"
  fi
  case "$name" in
    *"$ARCHIVE_SUFFIX") ;;
    *) fail "archive filename does not end with $ARCHIVE_SUFFIX: $name" ;;
  esac
}

validate_binary_path_in_archive() {
  path=$1
  [ -n "$path" ] || fail "binary.pathInArchive is empty"
  case "$path" in
    /*|*/|*\\\\*) fail "binary.pathInArchive must be a relative file path: $path" ;;
  esac
  old_ifs=$IFS
  IFS=/
  set -- $path
  IFS=$old_ifs
  for segment do
    case "$segment" in
      ""|.|..) fail "binary.pathInArchive contains an unsafe path segment: $path" ;;
    esac
  done
}

resolve_install_dir() {
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

detect_target() {
  os=$(uname -s | tr '[:upper:]' '[:lower:]')
  arch=$(uname -m)

  case "$os" in
    linux) os=linux ;;
    darwin) os=darwin ;;
    *) fail "unsupported OS: $os" ;;
  esac

  case "$arch" in
    x86_64|amd64) arch=x86_64 ;;
    arm64|aarch64) arch=aarch64 ;;
    *) fail "unsupported architecture: $arch" ;;
  esac

  case "$os/$arch" in
${targetCases(config.targets)}
    *) fail "unsupported target: $os/$arch" ;;
  esac

  printf '%s %s\\n' "$os" "$arch"
}

render_archive_asset_name() {
  version=$1
  os=$2
  arch=$3
  target="\${os}_\${arch}"
  printf '%s' ${renderTemplatePrintfArguments(template.segments)}
  printf '\\n'
}

download_and_install() {
  archive_url=$1
  checksum_url=$2
  archive_asset_name=$3
  tmpdir=$(mktemp -d) || fail "failed to create temporary directory"
  trap 'rm -rf "$tmpdir"' EXIT HUP INT TERM
  archive_path="$tmpdir/archive"
  checksum_path="$tmpdir/checksums"
  extract_dir="$tmpdir/extract"
  mkdir -p "$extract_dir" || fail "failed to create extract directory"

  curl -fsSL "$checksum_url" -o "$checksum_path" || fail "failed to download checksum file"
  curl -fsSL "$archive_url" -o "$archive_path" || fail "failed to download archive"

  expected_checksum=$(awk -v name="$archive_asset_name" '$2 == name { print $1; found=1; exit } END { if (!found) exit 1 }' "$checksum_path") \\
    || fail "checksum entry not found for $archive_asset_name"
  case "$CHECKSUM_COMMAND" in
    sha256sum)
      printf '%s  %s\\n' "$expected_checksum" "$archive_path" | sha256sum -c - >/dev/null \\
        || fail "archive checksum mismatch"
      ;;
    shasum)
      actual_checksum=$(shasum -a 256 "$archive_path" | awk '{ print $1 }') \\
        || fail "failed to compute archive checksum"
      [ "$actual_checksum" = "$expected_checksum" ] || fail "archive checksum mismatch"
      ;;
    *)
      fail "checksum command was not initialized"
      ;;
  esac

  case "$ARCHIVE_FORMAT" in
    tar.gz)
      tar -xzf "$archive_path" -C "$extract_dir" -- "$BINARY_PATH_IN_ARCHIVE" \\
        || fail "failed to extract $BINARY_PATH_IN_ARCHIVE from tar.gz archive"
      ;;
    zip)
      unzip -q "$archive_path" "$BINARY_PATH_IN_ARCHIVE" -d "$extract_dir" \\
        || fail "failed to extract $BINARY_PATH_IN_ARCHIVE from zip archive"
      ;;
    *)
      fail "unsupported archive format: $ARCHIVE_FORMAT"
      ;;
  esac

  extracted_binary="$extract_dir/$BINARY_PATH_IN_ARCHIVE"
  [ ! -L "$extracted_binary" ] || fail "archive binary entry must not be a symlink: $BINARY_PATH_IN_ARCHIVE"
  [ -f "$extracted_binary" ] || fail "archive binary entry is not a regular file: $BINARY_PATH_IN_ARCHIVE"

  mkdir -p "$INSTALL_DIR" || fail "failed to create install directory: $INSTALL_DIR"
  install_tmp="$INSTALL_DIR/.$BINARY_NAME.tmp.$$"
  rm -f "$install_tmp" || fail "failed to remove stale temporary install file: $install_tmp"
  cp "$extracted_binary" "$install_tmp" || fail "failed to copy binary to temporary install path"
  chmod +x "$install_tmp" || fail "failed to mark binary executable"
  mv "$install_tmp" "$INSTALL_DIR/$BINARY_NAME" || fail "failed to place binary in install directory"
  printf '%s\\n' "installed $BINARY_NAME to $INSTALL_DIR/$BINARY_NAME"
}

install_latest() {
  target=$(detect_target) || exit 1
  set -- $target
  os=$1
  arch=$2
${latestBody(config)}
}

install_pin() {
  pinned_version=$1
  is_valid_git_tag "$pinned_version" || fail "--version must be a valid Git tag and must not be latest"
  target=$(detect_target) || exit 1
  set -- $target
  os=$1
  arch=$2
  archive_asset_name=$(render_archive_asset_name "$pinned_version" "$os" "$arch")
  validate_archive_asset_name "$archive_asset_name"
  owner_path=$(url_encode_segment "$OWNER")
  repo_path=$(url_encode_segment "$REPO")
  version_path=$(url_encode_segment "$pinned_version")
  archive_path_segment=$(url_encode_segment "$archive_asset_name")
  checksum_path_segment=$(url_encode_segment "$CHECKSUM_FILE_NAME")
  archive_url="https://github.com/$owner_path/$repo_path/releases/download/$version_path/$archive_path_segment"
  checksum_url="https://github.com/$owner_path/$repo_path/releases/download/$version_path/$checksum_path_segment"
  download_and_install "$archive_url" "$checksum_url" "$archive_asset_name"
}

main "$@"
`;
}

export function previewArchiveNames(config: InstallerConfig, version: string) {
  const template = parseArchiveNameTemplate(config.archive.nameTemplate);
  if (!template.ok) {
    return [];
  }

  return config.targets.map((target) => {
    const name = expandArchiveNameTemplate(template.segments, {
      owner: config.owner,
      repo: config.repo,
      bin: config.binary.name,
      version,
      os: target.os,
      arch: target.arch,
    });
    return {
      ...target,
      name,
      validation: validateArchiveFilename(name, config.archive.format),
    };
  });
}

export function shellLiteral(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function renderTemplatePrintfArguments(segments: ArchiveTemplateSegment[]) {
  return segments
    .map((segment) => {
      if (segment.type === "literal") {
        return shellLiteral(segment.value);
      }

      const variable =
        segment.name === "owner"
          ? "OWNER"
          : segment.name === "repo"
            ? "REPO"
            : segment.name === "bin"
              ? "BINARY_NAME"
              : segment.name;
      return `"$${variable}"`;
    })
    .join(" ");
}

function targetCases(targets: Array<{ os: TargetOS; arch: TargetArch }>) {
  return targets.map((target) => `    ${target.os}/${target.arch}) ;;`).join("\n");
}

function latestBody(config: InstallerConfig) {
  if (config.versionResolver.type === "release_version_file") {
    return `  owner_path=$(url_encode_segment "$OWNER")
  repo_path=$(url_encode_segment "$REPO")
  version_file_path=$(url_encode_segment "$VERSION_FILE_NAME")
  version_file_url="https://github.com/$owner_path/$repo_path/releases/latest/download/$version_file_path"
  resolved_version=$(read_version_file "$version_file_url") || exit 1
  is_valid_git_tag "$resolved_version" || fail "resolved version is not a valid Git tag: $resolved_version"
  printf '%s\\n' "installerer: resolved latest version $resolved_version"
  archive_asset_name=$(render_archive_asset_name "$resolved_version" "$os" "$arch")
  validate_archive_asset_name "$archive_asset_name"
  version_path=$(url_encode_segment "$resolved_version")
  archive_path_segment=$(url_encode_segment "$archive_asset_name")
  checksum_path_segment=$(url_encode_segment "$CHECKSUM_FILE_NAME")
  archive_url="https://github.com/$owner_path/$repo_path/releases/download/$version_path/$archive_path_segment"
  checksum_url="https://github.com/$owner_path/$repo_path/releases/download/$version_path/$checksum_path_segment"
  download_and_install "$archive_url" "$checksum_url" "$archive_asset_name"`;
  }

  return `  printf '%s\\n' "installerer: install source latest"
  archive_asset_name=$(render_archive_asset_name "" "$os" "$arch")
  validate_archive_asset_name "$archive_asset_name"
  owner_path=$(url_encode_segment "$OWNER")
  repo_path=$(url_encode_segment "$REPO")
  archive_path_segment=$(url_encode_segment "$archive_asset_name")
  checksum_path_segment=$(url_encode_segment "$CHECKSUM_FILE_NAME")
  archive_url="https://github.com/$owner_path/$repo_path/releases/latest/download/$archive_path_segment"
  checksum_url="https://github.com/$owner_path/$repo_path/releases/latest/download/$checksum_path_segment"
  download_and_install "$archive_url" "$checksum_url" "$archive_asset_name"`;
}
