/**
 * GitHub Release URL construction fragments shared by the install flows.
 * Every path segment goes through url_encode_segment before being embedded.
 */
export function renderOwnerRepoPathEncoding(): string {
  return `  owner_path=$(url_encode_segment "$OWNER")
  repo_path=$(url_encode_segment "$REPO")
`;
}

export function renderVersionFileUrl(): string {
  return `  version_file_path=$(url_encode_segment "$VERSION_FILE_NAME")
  version_file_url="https://github.com/$owner_path/$repo_path/releases/latest/download/$version_file_path"
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
