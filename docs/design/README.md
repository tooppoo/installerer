# Design Documentation

These documents are for maintainers changing `installerer` itself. They preserve design structure and invariants that the implementation alone does not express; they do not restate what the code or [the user guide](../guide/README.md) already says.

- [Variable Dependency Graph And Context-Specific Validation](archive-template-validation.md) — how `archive.nameTemplate` and the config fields feeding it are validated by propagating usage contexts through a per-mode variable dependency graph. Read this before changing config validation, adding a template placeholder, or adding a new validation context.

## Where Authoritative Definitions Live

- `packages/core` — the runtime-independent generator core: config parsing/validation, installer script generation, runtime dependency definitions. Public behavior contracts are documented in [the user guide](../guide/README.md).
- `packages/cli` — the CLI on top of the core. Its exit codes are generated into [the CLI exit codes reference](../reference/exit-codes.md).
- `apps/web` — the browser SPA. Its contract viewer is generated from [the installer contract](../guide/installer-contract.md) at build time.

The package split and its dependency rules are decided in [the monorepo package boundaries ADR](../adr/20260703T231205Z_monorepo-package-boundaries.md), and `bun run check:boundaries` enforces them.

## Decision Records

Why a design was chosen — and which alternatives were rejected — is recorded in [the ADRs](../adr/README.md), not here. When a design document and an ADR seem to disagree, the design document describes the current state and the ADR records the decision at its time.
