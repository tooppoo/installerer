# User Guide

These documents are for people who use `installerer` — either through [the browser app](https://installerer.philomagi.dev/) or the CLI — and for maintainers whose GitHub Releases must satisfy what a generated installer expects.

Read them in this order:

1. [Installer Contract](installer-contract.md) — the minimum contract: project scope, the responsibility boundary between the browser app and the generated installer, the archive format and config semantics, the release asset layout, and the checksum file format. This is the normative starting point, and it is also what the browser app's contract viewer displays.
2. [Latest/Pinned Install Semantics](install-semantics.md) — the detailed semantics behind the contract: how a latest install resolves (or does not resolve) a release tag, which URLs a generated installer can reach, how reproducible each install mode is, and what checksum verification does and does not prove. Read this before making operational decisions about your release layout.
3. [Generated Installer Runtime](generated-installer-runtime.md) — the runtime mechanics of the generated `install.sh`: arguments, target detection, URL encoding, checksum lookup, archive extraction, binary placement, and the `--requirements` / `--check-requirements` introspection options. Read this when you need to know exactly what the script does on a host.

Exact, implementation-derived facts are kept in [the generated references](../reference/) rather than in these guides:

- [Generated Installer Runtime Dependencies](../reference/runtime-dependencies.md) — the commands a generated installer requires at runtime.
- [CLI Exit Codes](../reference/exit-codes.md) — the stable exit code table of the `installerer` CLI.
