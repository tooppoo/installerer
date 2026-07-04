export function renderCurlDownload(): string {
  return `curl_download() {
  url=$1
  output_path=$2
  label=$3
  printf '%s\\n' "installerer: requesting $url"
  curl -fsSL "$url" -o "$output_path" || fail "failed to download $label"
  printf '%s\\n' "installerer: downloaded files:"
  ls -la "$tmpdir"
}

`;
}
