# Generated Installer Runtime Dependencies

<!-- AUTO-GENERATED FILE — DO NOT EDIT. -->
<!-- Source of truth: packages/core/src/runtimeDependencies/definitions.ts -->
<!-- Regenerate with: bun run docs:generate -->

Required commands for every generated installer:

- `uname`
- `mktemp`
- `rm`
- `mkdir`
- `cp`
- `mv`
- `chmod`
- `curl`
- `awk`
- `grep`
- `od`
- `tr`
- `cut`
- `ls`
- `sha256sum` or `shasum`

Archive-format-specific commands:

- `tar` when `archive.format` is `tar.gz`
- `unzip` when `archive.format` is `zip`

If any required command is missing, the generated installer should stop with a clear error. Run `sh install.sh --requirements` to print the requirements resolved for that specific generated installer (its one selected archive-format command, plus reasons, premises, network, and filesystem items this generic list omits), or `sh install.sh --check-requirements` to probe for missing commands on the current host.
