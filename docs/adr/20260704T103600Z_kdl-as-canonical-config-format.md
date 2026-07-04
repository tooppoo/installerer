# Use KDL As The Canonical Config Format

- Status: Accepted
- Created: 2026-07-04T10:36:00Z

## Context

`installerer` originally assumed JSON as its config file format. The canonical file name was `installerer.json`.

The config is expected to be written, reviewed, copied, and shared by humans. For this use case, comments and a readable hierarchical structure are part of the user-facing contract.

The CLI also has separate `init`, `validate`, `generate`, and `doctor` commands. Without one canonical config format, templates, diagnostics, tests, documentation, and examples would split across multiple formats.

This decision records the config format decision from Issue #99.

## Decision

`installerer` uses KDL as its canonical config format.

- The canonical KDL syntax version is KDL 2.0.0.
- The canonical config file name is `installerer.kdl`.
- Version 0 does not support JSON/KDL dual config input.
- `kdljs` is the parser dependency.
- `kdljs` is used only for KDL syntax parsing and AST generation.
- `installerer` owns config shape validation, semantic validation, and mapping into the domain model.
- KDL AST must be converted through a codec layer before reaching domain logic.

The config pipeline is:

```txt
KDL text
  -> kdljs parse
  -> InstallerConfigKdlCodec
  -> InstallerConfig input object
  -> InstallerConfig validation
```

The canonical root is a single `installerer` node. The root node has no arguments, properties, or tags.

The following child nodes are singleton nodes:

- `source`
- `binary`
- `version-resolver`
- `archive`
- `checksum`
- `targets`
- `architecture-labels`
- `defaults`

The only repeatable node is `target` under `targets`.

KDL-facing names use kebab-case. Internal `InstallerConfig` fields keep the existing domain naming.

Diagnostics should prefer KDL-facing paths, such as:

```txt
installerer.binary.path-in-archive
installerer.targets.target[0].os
```

Diagnostics should distinguish `syntax`, `codec`, and `semantic` phases.

If the existing `ValidationError` model cannot naturally express KDL-facing diagnostics, it may be replaced by a config diagnostics model.

## Alternatives Considered

### Keep JSON As The Canonical Config Format

JSON is familiar and widely supported, but it is less suitable for hand-written, comment-rich config. Not selected.

### Support Both JSON And KDL In v0

Dual support would reduce migration concerns, but v0 does not yet have a stable compatibility surface. Supporting two formats would duplicate templates, tests, diagnostics, and documentation. Not selected.

### Pass KDL AST Directly Into Domain Logic

This would reduce initial code, but would leak parser-specific structure into domain logic and make diagnostics harder to control. Not selected.

## Consequences

### Positive Consequences

- Config examples and generated templates become easier to read and review.
- Comments are available in user-authored config files.
- CLI commands, tests, and documentation share one canonical format.
- Parser syntax handling is separated from config semantics.
- A codec layer keeps format-specific logic out of generator logic.
- Diagnostics can use user-facing KDL paths.

### Negative Consequences

- `installerer` depends on `kdljs`.
- Existing JSON parser code, JSON fixtures, and JSON-oriented diagnostics must be removed, migrated, or kept only as temporary internal material.
- KDL syntax that is valid as KDL may still be rejected by the `installerer` canonical subset.
- `kdljs` AST behavior and duplicate-property behavior must be characterized by tests.

### Neutral Consequences

- JSON-to-KDL migration is not implemented in v0.
- KDL Schema and editor support remain future work.
- `init`, `validate`, `generate`, and `doctor` use `installerer.kdl` as the config input.

## Follow-up Work

Implementation is split into follow-up issues:

- #106: KDL parser integration and `kdljs` behavior tests
- #107: config diagnostics model and formatter
- #108: `InstallerConfig` KDL codec

Command-specific work remains in:

- #88: `init`
- #89: `generate`
- #90: `validate`
- #91: `doctor`
