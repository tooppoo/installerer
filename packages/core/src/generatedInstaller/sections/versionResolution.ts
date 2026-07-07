import { templateUsesPlaceholder } from "../../archiveTemplate";
import type { RenderContext } from "../renderContext";

/**
 * Emitted only when archive.nameTemplate contains {version} (issue #111).
 * Scans the checksum-index file (fetched from /releases/latest/download/...)
 * for the one archive filename matching this target's prefix/suffix, then
 * extracts and validates the substring between them as the expected release
 * tag. Templates without {version} never need this: their latest install
 * downloads assets directly, with no tag to resolve.
 *
 * The `"$prefix"*"$suffix"` case pattern and the `${match#"$prefix"}` /
 * `${candidate%"$suffix"}` trims below rely on a POSIX rule: quoting a
 * parameter expansion inside a case pattern or a `#`/`%` removal word makes
 * it match literally, not as a glob. Do not remove those quotes — doing so
 * would let a prefix/suffix containing glob metacharacters (e.g. `*`, `?`)
 * match unintended filenames instead of being treated as literal text.
 *
 * `set -f` brackets the unquoted `set -- $line` split below: $line is
 * fetched Release content (semi-untrusted per this project's threat model),
 * and an unquoted split is subject to pathname expansion as well as field
 * splitting. Without `set -f`, a filename column containing a glob
 * metacharacter (e.g. `*`) could expand against files in the invoking
 * shell's working directory instead of staying the literal text that was in
 * the index file — this must stay disabled for the split only (not the
 * whole function), matching the field-splitting-only intent.
 */
export function renderVersionResolution({ templateSegments }: RenderContext): string {
  if (!templateUsesPlaceholder(templateSegments, "version")) {
    return "";
  }

  return `resolve_expected_release_tag() {
  index_path=$1
  prefix=$2
  suffix=$3
  match=
  match_count=0
  while IFS= read -r line || [ -n "$line" ]; do
    set -f
    set -- $line
    set +f
    filename=$2
    [ -n "$filename" ] || continue
    case "$filename" in
      "$prefix"*"$suffix")
        if [ "$filename" != "$match" ]; then
          match_count=$((match_count + 1))
          match=$filename
        fi
        ;;
    esac
  done < "$index_path"
  [ "$match_count" -gt 0 ] \\
    || fail "no release asset in $CHECKSUM_FILE_NAME matches the configured archive filename template"
  [ "$match_count" -eq 1 ] \\
    || fail "ambiguous: multiple release assets in $CHECKSUM_FILE_NAME match the configured archive filename template"
  candidate=\${match#"$prefix"}
  candidate=\${candidate%"$suffix"}
  is_valid_git_tag "$candidate" || fail "extracted release tag is not a valid Git tag: $candidate"
  is_filename_unsafe_tag "$candidate" && fail "extracted release tag is not safe as a filename: $candidate"
  printf '%s' "$candidate"
}

`;
}
