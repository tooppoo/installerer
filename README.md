# installerer

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![CI](https://github.com/tooppoo/installerer/actions/workflows/ci.yml/badge.svg)](https://github.com/tooppoo/installerer/actions/workflows/ci.yml)
[![CodeQL](https://github.com/tooppoo/installerer/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/tooppoo/installerer/actions/workflows/github-code-scanning/codeql)
[![codecov](https://codecov.io/gh/tooppoo/installerer/graph/badge.svg?token=VWoPYcPDsR)](https://codecov.io/gh/tooppoo/installerer)

`installerer` is a browser-based installer generator for GitHub Releases.

<https://installerer.philomagi.dev/>

Fill in a form and the app generates a single POSIX `sh` `install.sh` for your project. The SPA itself does not depend on the GitHub API, a backend, credentials, or any external communication — everything runs in the browser. The generated installer is what downloads GitHub Release assets, verifies checksums, and installs the binary at runtime.

## How it works

- The form input builds a JSON config that is handed to the generator core internally.
- The generated `install.sh` installs the latest release when `--version` is omitted, or a pinned release with `--version <version>`.
- Whether a latest install resolves an actual release tag is decided by whether `archive.nameTemplate` contains `{version}`: with `{version}`, latest install scans the checksum file (fetched from the latest release) as a version-resolution index and re-downloads from the resolved tag; without `{version}`, latest install downloads versionless assets directly from the latest release. No release ever needs to publish a separate version file asset.

Your releases must follow a small contract for asset naming and checksum files. See the documents below for details.

## CLI

`installerer` also ships as a generator-only CLI (`init`, `validate`, `generate`, `doctor`, `--version`, `--help`) for scripting and CI use, in addition to the browser UI. Command implementations are landing incrementally; today only `installerer --help` / `-h` is implemented.

npm is an auxiliary distribution channel for the JavaScript ecosystem, not the canonical binary distribution — it is a Node.js CLI package and does not download a GitHub Releases binary. The canonical distribution is a Bun-compiled standalone executable released as an OS/architecture archive; see [CLI Distribution Policy](docs/adr/20260703T091000Z_cli-distribution-policy.md) for the full decision.

GitHub Releases publish the canonical standalone executable as archives named:

- `installerer_{version}_Linux_x86_64.tar.gz`
- `installerer_{version}_Linux_arm64.tar.gz`
- `installerer_{version}_Darwin_x86_64.tar.gz`
- `installerer_{version}_Darwin_arm64.tar.gz`

Each archive contains the executable at archive-root path `installerer`. The v0 Linux archives target glibc-based systems; musl / Alpine Linux support is tracked separately in issue #92.

GitHub Release tags use `v{version}`. The archive filenames and uploaded `VERSION` asset use the repository root package version without the `v` prefix.

Install from npm:

```bash
npm install -g @philomagi/installerer
installerer --help
```

## Documentation

- [Installer Contract](docs/installer-contract.md) — the release asset contract, latest/pinned install overview, and runtime dependencies. Also viewable from the browser UI.
- [Resolver Semantics](docs/resolver-semantics.md) — detailed latest/pinned install semantics, network access boundary, reproducibility, checksum verification guarantees and limits, and JSON config examples for both `{version}` and versionless archive templates.
- [Generated Installer Runtime](docs/generated-installer-runtime.md) — detailed runtime behavior of the generated installer.
- [MVP Browser JS Installer Generator Policy](docs/adr/20260630T032548Z_mvp-browser-js-generator-policy.md)
- [Generated Installer Runtime ADR](docs/adr/20260630T174038Z_generated-installer-runtime-single-posix-sh.md)
- [Template-Driven Latest Install Tag Resolution ADR](docs/adr/20260707T022251Z_template-driven-latest-install-tag-resolution.md) (supersedes the earlier [latest_asset Resolver ADR](docs/adr/20260701T143939Z_latest-asset-resolver-versionless-direct-download.md))
- [CLI Distribution Policy](docs/adr/20260703T091000Z_cli-distribution-policy.md)
- [npm Node.js CLI Package ADR](docs/adr/20260703T134302Z_npm-node-cli-package.md)

## Development

To install dependencies:

```bash
bun install
```

To start a development server:

```bash
bun dev
```

To run for production:

```bash
bun start
```

`docs/installer-contract.md` is the source of truth for the in-app contract viewer. After editing it, regenerate the UI module:

```bash
bun run docs:generate
```

CI verifies the generated module is in sync via `bun run docs:check`.

This project was created using `bun init` in bun v1.3.14. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
