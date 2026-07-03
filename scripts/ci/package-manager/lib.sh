#!/usr/bin/env sh
# Shared helpers for scripts/ci/package-manager/*-smoke.sh. Sourced, not
# executed directly.
set -eu

# A fresh, isolated project directory for one smoke run.
smoke_workdir() {
  mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/installerer-pm-smoke.XXXXXX"
}

# Writes a minimal, private package.json so each package manager's `add`/
# `install` command has a project to install into, without depending on
# that package manager's own `init` command output shape.
smoke_write_package_json() {
  printf '%s\n' '{ "name": "installerer-pm-smoke", "private": true }' >package.json
}

# $1: the installed CLI's `--help` stdout. Fails loudly if it does not look
# like installerer's top-level help text.
smoke_assert_help_output() {
  case "$1" in
    *"installerer <command> [options]"*) return 0 ;;
    *)
      echo "unexpected --help output:" >&2
      echo "$1" >&2
      exit 1
      ;;
  esac
}
