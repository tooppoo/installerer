#!/usr/bin/env sh
# Usage: bun-smoke.sh <tarball-path>
#
# Installs the packed npm CLI tarball with `bun add` into a fresh project
# and runs the installed `installerer` command. This is JavaScript-ecosystem
# package manager compatibility coverage, distinct from the Bun runtime
# boundary enforced on the built artifact itself by build:npm.
set -eu

tarball="$1"
script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=./lib.sh
. "$script_dir/lib.sh"

cd "$(smoke_workdir)"
smoke_write_package_json

bun add "$tarball"

output="$(./node_modules/.bin/installerer --help)"
smoke_assert_help_output "$output"

echo "bun-smoke: ok"
