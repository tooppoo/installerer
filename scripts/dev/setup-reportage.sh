#!/usr/bin/env sh
set -eu

# The e2e suite (e2e/*.repor) and its version-matched docs cache target
# exactly this pre-1.0 version. Bump the pin and refresh the docs cache
# together, deliberately.
REPORTAGE_VERSION="0.0.6"

curl -fsSL "https://raw.githubusercontent.com/tooppoo/reportage/${REPORTAGE_VERSION}/install.sh" \
  | sh -s -- --version "$REPORTAGE_VERSION"

reportage --version
