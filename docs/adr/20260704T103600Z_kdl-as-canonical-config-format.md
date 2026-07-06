# Use KDL As The Canonical Config Format

- Status: Accepted
- Created: 2026-07-04T10:36:00Z

> **Amendment (2026-07-06, #106):** `kdljs@0.3.0` was added as a
> `packages/core` runtime dependency, resolved and pinned in `bun.lock`. A
> parser wrapper (`packages/core/src/kdl/parseKdlText.ts`) normalizes
> `kdljs`'s parse behavior into `ParseKdlTextResult` (`ok: true` /
> `ok: false`), and `kdljs`'s own AST/error behavior is pinned by
> characterization tests (`packages/core/src/kdl/kdljsBehavior.characterization.test.ts`).
> This issue did not implement the KDL AST -> `InstallerConfig` codec (#108).
>
> Findings:
>
> - **AST shape installerer may rely on**: a `Document` is a plain
>   `Node[]` (no implicit single-root wrapper). Each `Node` is
>   `{ name: string, values: Value[], properties: Record<string, Value>,
children: Document, tags: { name: string|undefined, values:
(string|undefined)[], properties: Record<string, string> } }`, where
>   `Value = string | number | boolean | null`. A node with no children
>   block and a node with an empty `{}` block both produce `children: []`
>   (indistinguishable). A node with no type annotation has
>   `tags.name === undefined`.
> - **Parse failure normalization**: `kdljs@0.3.0`'s `parse()` reports KDL
>   syntax errors via its return value (`{ output: undefined, errors:
[...] }`) and never throws for syntax errors in KDL text; each error
>   exposes a `token` with `startLine`/`startColumn`/`startOffset`, which
>   the wrapper surfaces as `location`. `parse()` does throw for some
>   malformed non-string inputs (e.g. `null`), so the wrapper also
>   catches thrown errors to keep raw `kdljs`/chevrotain errors from
>   reaching callers. Both cases normalize to
>   `{ ok: false, errors: KdlSyntaxError[] }`, where each error carries a
>   `message`, an optional `location`, and the original error as `cause`
>   (kept for #107's diagnostics formatter).
> - **Duplicate property**: not detectable via `kdljs`'s public AST.
>   `kdljs` assigns each property directly onto a plain
>   `Record<string, Value>` (last-write-wins); the discarded earlier
>   value(s) are not retained anywhere in the parse result or the error
>   list, and no error is raised. If duplicate-property rejection becomes
>   a hard requirement, it cannot be implemented by inspecting `kdljs`'s
>   AST alone; a future issue would need a separate pre-parse text scan,
>   since replacing the parser is out of scope for v0 (per #99).
> - **KDL 2.0.0 support**: `kdljs@0.3.0`'s CHANGELOG documents its parser,
>   formatter, types, and KQL support as updated to KDL 2.0. This was
>   confirmed experimentally: it accepts the KDL 2.0.0 `#true`/`#false`/
>   `#null` keyword literals and rejects the old KDL 1.0.0 bare
>   `true`/`false`/`null` keyword syntax as a syntax error. No limitation
>   was found that affects the installerer canonical subset; the #99
>   canonical KDL example parses with zero errors.
> - **Canonical subset enforcement stays installerer's responsibility**:
>   `kdljs` parses unknown child nodes, unexpected positional arguments,
>   unexpected properties, and unexpected type annotations without any
>   error. This confirms the codec/semantic validation layer (#108) must
>   reject all of these itself; `kdljs` will not do it.

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
