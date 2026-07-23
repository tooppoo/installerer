# installerer

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0) [![CI](https://github.com/tooppoo/installerer/actions/workflows/ci.yml/badge.svg)](https://github.com/tooppoo/installerer/actions/workflows/ci.yml) [![CodeQL](https://github.com/tooppoo/installerer/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/tooppoo/installerer/actions/workflows/github-code-scanning/codeql) [![codecov](https://codecov.io/gh/tooppoo/installerer/graph/badge.svg?token=VWoPYcPDsR)](https://codecov.io/gh/tooppoo/installerer)

`installerer` is a browser-based installer generator for GitHub Releases.

<https://installerer.philomagi.dev/>

Fill in a form and the app generates a single POSIX `sh` `install.sh` for your project. The SPA itself does not depend on the GitHub API, a backend, credentials, or any external communication — everything runs in the browser. The generated installer is what downloads GitHub Release assets, verifies checksums, and installs the binary at runtime.

Your releases must follow a small contract for asset naming and checksum files. Start with [the installer contract](docs/guide/installer-contract.md); [the documentation index](docs/README.md) explains what else to read and when.

## CLI

`installerer` also ships as a generator-only CLI, in addition to the browser UI.

The canonical distribution is a Bun-compiled standalone executable published as OS/architecture archives on GitHub Releases;

npm is an auxiliary distribution channel for the JavaScript ecosystem (a Node.js CLI package that does not download a GitHub Releases binary).

See [the CLI distribution policy ADR](docs/adr/20260703T091000Z_cli-distribution-policy.md) for the archive naming and the full decision.

### Install from installer

```sh
curl -fsSL https://raw.githubusercontent.com/tooppoo/installerer/refs/heads/main/install.sh | sh
```

### Install from npm

```sh
npm install -g @philomagi/installerer
```

### Install from devcontainer feature

https://github.com/tooppoo/catalog-devcontainer-features/tree/main/src/installerer

```json
"features": {
    "ghcr.io/tooppoo/catalog-devcontainer-features/installerer:0": {}
}
```

## Documentation

[The documentation index](docs/README.md) explains each documentation area and its audience:

- [User guide](docs/guide/README.md) — the release asset contract, latest/pinned install semantics, and the runtime behavior of the generated installer.
- [Generated references](docs/README.md#generated-references) — runtime dependencies and CLI exit codes, generated from the implementation.
- [Design documentation](docs/design/README.md) — for maintainers changing `installerer` itself.
- [Architecture decision records](docs/adr/README.md) — why the project works the way it does.

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

Some documents are generated. After editing [the installer contract](docs/guide/installer-contract.md) (the source of the in-app contract viewer) or the definitions behind [the generated references](docs/README.md#generated-references), regenerate them:

```bash
bun run docs:generate
```

CI verifies the generated files are in sync via `bun run docs:check`.

This project was created using `bun init` in bun v1.3.14. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
