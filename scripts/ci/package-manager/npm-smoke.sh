#!/usr/bin/env sh
# Usage: npm-smoke.sh <tarball-path>
#
# Installs the packed npm CLI tarball with npm into a fresh project and
# runs the installed `installerer` command.
set -eu

tarball="$1"
script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=./lib.sh
. "$script_dir/lib.sh"

cd "$(smoke_workdir)"
smoke_write_package_json

npm install --no-audit --no-fund "$tarball"

output="$(./node_modules/.bin/installerer --help)"
smoke_assert_help_output "$output"

echo "npm-smoke: ok"
