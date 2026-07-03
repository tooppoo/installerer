#!/usr/bin/env sh
# Usage: yarn-node-modules-smoke.sh <tarball-path>
#
# Installs the packed npm CLI tarball with Yarn Berry, explicitly configured
# for the node-modules linker (instead of the default PnP linker), into a
# fresh project and runs the installed `installerer` command.
set -eu

tarball="$1"
script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=./lib.sh
. "$script_dir/lib.sh"

corepack prepare yarn@stable --activate

cd "$(smoke_workdir)"
smoke_write_package_json
printf '%s\n' 'nodeLinker: node-modules' >.yarnrc.yml

yarn add "$tarball"

output="$(./node_modules/.bin/installerer --help)"
smoke_assert_help_output "$output"

echo "yarn-node-modules-smoke: ok"
