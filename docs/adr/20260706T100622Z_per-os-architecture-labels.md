# Architecture Labels Are Resolved Per Target OS

- Status: Accepted
- Created: 2026-07-06T10:06:22Z

## Context

[Canonical Architecture Is Separate From The Asset Architecture Label](20260703T090945Z_canonical-architecture-vs-asset-architecture-label.md) introduced `architectureLabels` as a single `canonical_arch -> asset_arch_label` mapping applied uniformly to every target OS. Real Release asset layouts, however, are not always uniform across OSes: the same project may publish `reportage_v1.2.3_Linux_x86_64.tar.gz` next to `reportage_v1.2.3_Darwin_arm64.tar.gz` — the OS-reported spelling on one OS and the `GOARCH`-style spelling (or any custom label) on another. A single mapping cannot express such layouts, so the generated installer could not be pointed at them at all.

This is recorded as an ADR because it changes the shape of a public config field (`architectureLabels`), the runtime contract of the generated installer (`resolve_asset_arch_label` now resolves per OS/architecture pair), and the placement of `archive.osCase` handling in the generated script. It extends, and must not regress, the canonical-vs-label separation established by the earlier ADR.

## Decision

`architectureLabels` maps `(target_os, canonical_arch)` — not `canonical_arch` alone — to `asset_arch_label`. The config field accepts two forms, detected from the top-level keys (the OS and architecture key sets are disjoint):

- **flat** (existing form): `{ "x86_64": "amd64", "aarch64": "arm64" }` — one mapping applied to every target OS
- **per OS** (new form): `{ "linux": { "x86_64": "x86_64" }, "darwin": { "x86_64": "amd64" } }` — one mapping per target OS

Mixing OS keys and architecture keys in one object must be rejected. In both forms, any omitted OS or architecture key falls back to the default label (the OS-reported architecture name, per the earlier ADR). Both forms normalize to the same resolved shape, `Record<TargetOS, Record<TargetArch, string>>`; consumers of the validated config never see the input form.

The generated installer's stage-2 resolution keys on the canonical OS/architecture pair:

```sh
resolve_asset_arch_label() {
  canonical_os=$1
  canonical_arch=$2

  case "$canonical_os/$canonical_arch" in
    linux/x86_64) asset_arch_label='x86_64' ;;
    linux/aarch64) asset_arch_label='aarch64' ;;
    darwin/x86_64) asset_arch_label='amd64' ;;
    darwin/aarch64) asset_arch_label='arm64' ;;
    *) fail "unsupported target: $canonical_os/$canonical_arch" ;;
  esac

  printf '%s\n' "$asset_arch_label"
}
```

Because stage 2 now consumes the OS value, `detect_target()` must output the canonical lowercase OS name. The `archive.osCase` conversion (`linux -> Linux`) previously ran inside `detect_target()`; it moves into `render_archive_asset_name()`, the point where the OS name becomes part of an asset name. This keeps the earlier ADR's invariant intact: every resolution stage keys on canonical values only, and asset-name spelling concerns (`archive.osCase`, `architectureLabels`) are applied exactly where the name is rendered.

The variable dependency graph models `asset_arch_label` as derived from `os`, `arch`, and one `architectureLabels.<os>.<canonical_arch>` node per pair, so the existing `archive-filename-context` and `shell-literal-context` rules cover per-OS labels without a new rule.

The browser form keeps one shared preset/custom selector pair by default and adds a "Specify per OS" toggle. Enabling the toggle seeds every OS from the shared values (the generated config is unchanged until an OS-specific label is edited); the built config uses the flat form when the toggle is off and the per-OS form when it is on. As before, preset vs. custom is display-only state derived from the current value.

## Alternatives Considered

### Per-OS Form Only (Drop The Flat Form)

Require every config to spell out `linux`/`darwin` sub-objects. This forces the common case — one convention across all OSes, which is what `goreleaser`-style pipelines produce — to duplicate the same two labels per OS, and it breaks every existing config and fixture for no expressiveness gain. The flat form is unambiguous (the key sets are disjoint) and remains the natural spelling of "uniform across OSes". Not selected.

### Per-Target Labels Inside `targets`

Attach an optional `archLabel` to each `targets` entry (`{ os, arch, archLabel? }`). This couples "which hosts the installer supports" with "what the release calls an architecture" — exactly the two concerns the earlier ADR separates — and it makes the default/override story murky (a target without `archLabel` needs a fallback mapping anyway). It would also spread the label mapping across the config instead of keeping it one reviewable object. Not selected.

### Key The Runtime Case Statement On The osCase-Converted OS Name

Keep the `archive.osCase` conversion inside `detect_target()` and generate `resolve_asset_arch_label` case arms matching the converted spelling (`Linux/x86_64`). This makes a label-resolution stage key on a display spelling, so two config fields (`archive.osCase` and `architectureLabels`) would interact inside generated runtime logic, and the earlier ADR's rule that resolution stages consume canonical values only would silently erode. Moving the osCase conversion to `render_archive_asset_name()` keeps each stage's input canonical. Not selected.

## Consequences

### Positive Consequences

- Release layouts whose architecture spelling differs per OS (for example `Linux_x86_64` plus `Darwin_arm64`) are now expressible, without enumerating conventions in the generator.
- Existing configs keep working unchanged: the flat form remains valid and normalizes to the same resolved mapping it produced before.
- `detect_target()` now always reports canonical values, which simplifies reasoning about the runtime: only `render_archive_asset_name()` and `resolve_asset_arch_label()` deal in asset-name spellings.

### Negative Consequences

- The normalized `InstallerConfig.architectureLabels` type changed shape (`Record<TargetArch, string>` → `Record<TargetOS, Record<TargetArch, string>>`), a breaking change for API consumers of `@installerer/core` (the web app and CLI in this repository were updated in the same change).
- The generated `resolve_asset_arch_label` case statement grows from two arms to four, and the config surface documented in `installer-contract.md` and the dependency-graph doc grows a second accepted form.
- Validation error paths for label values always use the normalized per-OS path (for example `$.architectureLabels.linux.x86_64`) in graph-rule messages, even when the user wrote the flat form.

### Neutral Consequences

- Generated asset names are unchanged for all existing configs; only configs that opt into the per-OS form produce different names per OS.
- Duplicate labels across architectures or OSes remain allowed (for example `universal`), consistent with the earlier ADR.
