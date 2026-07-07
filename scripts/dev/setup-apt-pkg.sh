#!/usr/bin/env sh
set -eu

sudo apt update
sudo apt install shellcheck -y

# apt's `just` package version varies by distro/release (e.g. an old
# Ubuntu archive vs. Debian trixie in the devcontainer), which drifted
# far enough behind to lack Justfile features like the `[group(...)]`
# attribute. Pin a known-good version via the official installer instead.
JUST_VERSION="1.40.0"
curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh \
  | bash -s -- --to "$HOME"/.local/bin --tag "$JUST_VERSION"

just --version
shellcheck --version
