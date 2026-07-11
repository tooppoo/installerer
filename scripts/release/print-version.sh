#!/usr/bin/env sh
set -eu

# wf-cross-platform-build's own fallback (stripping a leading "v" off $GITHUB_REF_NAME) breaks on non-tag refs such as a PR merge ref ("131/merge"), which ci.yml's build-only run uses.
# package.json's version is well-formed in every trigger context, and release.yml's tag/version guard step already keeps it equal to the release tag.
node -p "'v' + require('./package.json').version"
