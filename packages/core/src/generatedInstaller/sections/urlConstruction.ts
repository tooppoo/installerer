/**
 * GitHub Release URL construction fragments shared by the install flows.
 * Every path segment goes through url_encode_segment before being embedded.
 */
export function renderOwnerRepoPathEncoding(): string {
  return `  owner_path=$(url_encode_segment "$OWNER")
  repo_path=$(url_encode_segment "$REPO")
`;
}

/**
 * The single request a {version} archive template's latest install makes
 * before it knows the release tag (issue #111): fetches the checksum file
 * from the latest release as a version-resolution index, scanned by
 * `resolve_expected_release_tag` for the current target's archive filename.
 */
export function renderChecksumIndexUrl(): string {
  return `  checksum_index_path_segment=$(url_encode_segment "$CHECKSUM_FILE_NAME")
  checksum_index_url="https://github.com/$owner_path/$repo_path/releases/latest/download/$checksum_index_path_segment"
`;
}

export function renderVersionedReleaseUrls(versionVariable: string): string {
  return `  version_path=$(url_encode_segment "$${versionVariable}")
  archive_path_segment=$(url_encode_segment "$archive_asset_name")
  checksum_path_segment=$(url_encode_segment "$CHECKSUM_FILE_NAME")
  archive_url="https://github.com/$owner_path/$repo_path/releases/download/$version_path/$archive_path_segment"
  checksum_url="https://github.com/$owner_path/$repo_path/releases/download/$version_path/$checksum_path_segment"
`;
}

export function renderLatestReleaseUrls(): string {
  return `  archive_path_segment=$(url_encode_segment "$archive_asset_name")
  checksum_path_segment=$(url_encode_segment "$CHECKSUM_FILE_NAME")
  archive_url="https://github.com/$owner_path/$repo_path/releases/latest/download/$archive_path_segment"
  checksum_url="https://github.com/$owner_path/$repo_path/releases/latest/download/$checksum_path_segment"
`;
}
