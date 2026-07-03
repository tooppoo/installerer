/**
 * Body fragment of download_and_install(); composed in installFlow.ts.
 */
export function renderInstallCompletionMessage(): string {
  return `  printf '%s\\n' "installed $BINARY_NAME to $INSTALL_DIR/$BINARY_NAME"
`;
}
