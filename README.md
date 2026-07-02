# installerer

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![CI](https://github.com/tooppoo/installerer/actions/workflows/ci.yml/badge.svg)](https://github.com/tooppoo/installerer/actions/workflows/ci.yml)
[![CodeQL](https://github.com/tooppoo/installerer/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/tooppoo/installerer/actions/workflows/github-code-scanning/codeql)
[![codecov](https://codecov.io/gh/tooppoo/installerer/graph/badge.svg?token=VWoPYcPDsR)](https://codecov.io/gh/tooppoo/installerer)

`installerer` is a browser-based installer generator for GitHub Releases.

Fill in a form and the app generates a single POSIX `sh` `install.sh` for your project. The SPA itself does not depend on the GitHub API, a backend, credentials, or any external communication — everything runs in the browser. The generated installer is what downloads GitHub Release assets, verifies checksums, and installs the binary at runtime.

## How it works

- The form input builds a JSON config that is handed to the generator core internally.
- The generated `install.sh` installs the latest release when `--version` is omitted, or a pinned release with `--version <version>`.
- Two version resolvers are supported: `release_version_file` (resolves the latest tag via a `VERSION` release asset) and `latest_asset` (downloads versionless assets directly from the latest release).

Your releases must follow a small contract for asset naming and checksum files. See the documents below for details.

## Documentation

- [Installer Contract](docs/installer-contract.md) — the release asset contract, resolver overview, and runtime dependencies. Also viewable from the browser UI.
- [Resolver Semantics](docs/resolver-semantics.md) — detailed resolver semantics, network access boundary, latest/pinned reproducibility, checksum verification guarantees and limits, and per-resolver JSON config examples.
- [Generated Installer Runtime](docs/generated-installer-runtime.md) — detailed runtime behavior of the generated installer.
- [MVP Browser JS Installer Generator Policy](docs/adr/20260630T032548Z_mvp-browser-js-generator-policy.md)
- [Generated Installer Runtime ADR](docs/adr/20260630T174038Z_generated-installer-runtime-single-posix-sh.md)
- [latest_asset Resolver ADR](docs/adr/20260701T143939Z_latest-asset-resolver-versionless-direct-download.md)

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
