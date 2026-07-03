#!/usr/bin/env sh
# Usage: yarn-pnp-smoke.sh <tarball-path>
#
# Installs the packed npm CLI tarball with Yarn Berry's default Plug'n'Play
# linker into a fresh project and runs the installed `installerer` command
# via `yarn exec` (there is no node_modules/.bin under PnP).
set -eu

tarball="$1"
script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=./lib.sh
. "$script_dir/lib.sh"

corepack prepare yarn@stable --activate

cd "$(smoke_workdir)"
smoke_write_package_json

yarn add "$tarball"

output="$(yarn exec installerer --help)"
smoke_assert_help_output "$output"

echo "yarn-pnp-smoke: ok"
