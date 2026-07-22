# @philomagi/installerer

The generator-only command-line interface for [`installerer`](../../README.md).

`installerer` turns a [KDL](https://kdl.dev/) configuration file into a single self-contained POSIX `sh` `install.sh` for a project's GitHub Releases.
The CLI is the scripting and CI counterpart to the browser UI: it reads a config, validates it, and writes the installer, without downloading release assets or contacting GitHub itself.
The generated `install.sh` is what fetches assets, verifies checksums, and installs the binary at runtime.

For what a project's releases must provide so a generated installer can find and verify assets, see [the installer contract](../../docs/guide/installer-contract.md) and [the user guide](../../docs/guide/README.md).

## Installation

```bash
npm install -g @philomagi/installerer
installerer --help
```

The npm package is a Node.js CLI and requires Node.js `>=22`.
It is an auxiliary distribution channel; the canonical distribution is a Bun-compiled standalone executable published as OS/architecture archives on GitHub Releases.
See [the CLI distribution policy ADR](../../docs/adr/20260703T091000Z_cli-distribution-policy.md) for the archive naming and the full decision.

## Commands

Every command accepts `-h`/`--help` and `-v`/`--version`.
Running `installerer` with no command prints the top-level help.

### `installerer init`

Writes a starter `installerer.kdl` config template to the current directory.
It never overwrites an existing file; if `installerer.kdl` already exists, `init` reports that and leaves the file untouched.

```bash
installerer init
```

### `installerer validate --config <path>`

Reads a KDL config, checks its syntax, and validates it against the installer config rules.
On success it reports the resolved repository and target count; validation and syntax problems are printed as diagnostics.

```bash
installerer validate --config installerer.kdl
```

### `installerer generate --config <path> --out <path>`

Validates the config and writes the generated `install.sh` to `--out`.
The output is written atomically, and `--config` and `--out` must not point to the same file.
`--out -` (writing the installer to stdout) is not supported; an installer is always written to a file.

```bash
installerer generate --config installerer.kdl --out install.sh
```

### `installerer doctor --config <path>`

Validates the config and prints a human-readable report: a config summary, archive-name previews for each target, the runtime dependencies the generated installer needs, and display-only helper diagnostics such as install-command examples and expected release-asset names.
`doctor` performs no network access; the `curl` strings it prints are hints for you to run yourself.

```bash
installerer doctor --config installerer.kdl
```

## Exit codes

The CLI uses one stable exit code per distinct error cause rather than a single generic failure code.
The full table is generated from the implementation; see [the CLI exit codes reference](../../docs/reference/exit-codes.md).

## Development

This package is part of the `installerer` monorepo; see [the repository README](../../README.md#development) for workspace-wide setup.

Build the npm publish artifact and typecheck this package:

```bash
bun run build      # assembles the npm publish directory under dist/
bun run typecheck
```

The published npm README is the repository root README, copied into the publish directory at build time; this file documents the package within the monorepo.
