# Canonical Architecture Is Separate From The Asset Architecture Label

- Status: Accepted
- Created: 2026-07-03T09:09:45Z

## Context

The generated installer detects the host CPU architecture at runtime and embeds an architecture-derived string in the Release asset filename it downloads, via the `{arch}`/`{target}` placeholders in `archive.nameTemplate`. Before this change, both roles were played by a single value: `TargetArch` (`"x86_64" | "arm64"`), fixed by the generator and copied verbatim into the asset name.

Release asset naming conventions vary across ecosystems and build tools even for the same physical architecture: `x86_64` builds are commonly published as `amd64` or `x86_64`; `aarch64` builds are commonly published as `arm64` or `aarch64`. Enumerating every such spelling (and every future one a project might invent) as a special case in `installerer` would turn the generator into a naming-convention catalog rather than a general-purpose tool. At the same time, the runtime architecture the installer actually detects (`uname -m`) is a small, fixed, and unambiguous set of values that must not be user-configurable, because it governs which host the installer can run on, not what a release calls that host.

This is recorded as an ADR because it changes a public config field (`TargetArch`'s values, and the new `architectureLabels` field), the runtime contract of the generated installer (a new two-stage architecture resolution), and the semantics of an existing template placeholder (`{arch}`); other resolvers, docs, and future work must not silently regress this separation. See [Issue #76](https://github.com/tooppoo/installerer/issues/76).

## Decision

Architecture is split into two distinct concepts that never share a resolution path with runtime detection:

- **`canonical_arch`** — the CPU architecture the generated installer detects at runtime, normalized to exactly `x86_64` or `aarch64`. This is fixed generator logic, never user-configurable.
- **`asset_arch_label`** — the string embedded in the Release asset filename. Configured per canonical architecture via a new `architectureLabels: { x86_64: string; aarch64: string }` config field, defaulting to `{ x86_64: "x86_64", aarch64: "aarch64" }` (the OS-reported architecture name) when omitted.

The variable dependency graph (see [Variable Dependency Graph And Context-Specific Validation](../design/archive-template-validation.md)) models this as `asset_arch_label` derived from both `arch` (canonical) and the two `architectureLabels.<canonical_arch>` config values; `{arch}`/`{target}` in `archive.nameTemplate` derive `archive_asset_name` from `asset_arch_label`, never from `arch` directly. This is not just documentation — it is why the existing `archive-filename-context` and `shell-literal-context` rules already validate custom architecture labels without a new rule: the dependency graph is the mechanism, not the label's cosmetic role.

The generated installer resolves architecture in two independent stages:

```sh
# Stage 1 — runtime canonicalization (detect_target, fixed logic)
case "$arch" in
  x86_64) arch=x86_64 ;;
  aarch64|arm64) arch=aarch64 ;;
  *) fail "unsupported architecture: $arch" ;;
esac

# Stage 2 — configured label resolution (resolve_asset_arch_label)
case "$canonical_arch" in
  x86_64) asset_arch_label='x86_64' ;;
  aarch64) asset_arch_label='aarch64' ;;
  *) fail "unsupported architecture: $canonical_arch" ;;
esac
```

Only stage 2's right-hand values change with configuration. `amd64` is deliberately not accepted as a raw `uname -m` value in stage 1: it is a common asset-label spelling, not a `uname -m` output, and accepting it there would silently conflate the two concepts this ADR separates. A custom `asset_arch_label` cannot extend or alter stage 1's runtime architecture detection — a project cannot use a custom label to make the installer recognize `riscv64`, for example; that would require the canonical architecture set itself to grow, which is out of scope here.

`asset_arch_label` values (preset or custom) are validated against `^[A-Za-z0-9._+-]+$`, with `.` and `..` rejected explicitly since they match that pattern but are unsafe path segments. Two canonical architectures may resolve to the same `asset_arch_label` (for example both mapped to `universal`); this is accepted, not rejected, because it is a distribution-layout choice, not a safety concern.

The browser form offers `amd64`/`x86_64`/custom for `x86_64` and `arm64`/`aarch64`/custom for `aarch64`. Preset vs. custom is a UI display concern only, derived from whether the current value matches a preset — it is not persisted as separate state and is not part of the normalized config, which stores only the resolved `architectureLabels` mapping.

## Alternatives Considered

### Keep A Single Architecture Value, Let Users Override The Runtime Case Statement

Expose the entire `detect_target()` architecture `case` statement (including the `uname -m` matching) as configurable, so a custom label could also add new recognized runtime values. This conflates "what the installer calls itself when publishing" with "what hosts the installer works on," which is exactly the ambiguity this ADR exists to remove. It would also let a misconfigured custom label accidentally change which real hosts the installer can detect. Not selected.

### Enumerate Every Known Asset-Label Convention As Built-In Presets

Ship a long built-in list of every architecture spelling seen across ecosystems (`x64`, `amd64`, `x86_64`, `arm64`, `aarch64`, `arm64-v8a`, and so on) instead of a small preset list plus custom input. This turns `installerer` into a maintenance burden that tracks external naming conventions instead of generating installers, and any list is necessarily incomplete. A small representative preset set (the two most common spellings per architecture) plus a validated custom field covers the common case with minimal surface and lets projects with unusual naming (or none of the presets) express any safe label directly. Not selected.

### Make Custom Label Selection Reject Duplicate Labels Across Architectures

Reject configs where `x86_64` and `aarch64` resolve to the same `asset_arch_label` (e.g. both `universal`), since it could be seen as ambiguous. This is a legitimate distribution choice for projects that publish a single "fat"/universal binary or archive for multiple architectures, and no runtime safety property depends on `asset_arch_label` values being distinct — `canonical_arch`, not `asset_arch_label`, is what governs installer behavior. Not selected.

### Default To The Go `GOARCH` Convention (`amd64`/`arm64`)

An earlier version of this decision defaulted `architectureLabels` to `{ x86_64: "amd64", aarch64: "arm64" }`, matching the naming convention Go's `GOARCH` popularized (via `goreleaser` and similar tools) and now used well beyond the Go ecosystem. The reasoning was that more real-world Release asset layouts already use this spelling, so a zero-config default would match more existing projects out of the box.

This was reconsidered: which architecture-label convention to default to is fundamentally a question about what the CPU architecture is called, and the OS itself already has an answer — the name `uname -m` reports once canonicalized (`x86_64`, `aarch64`). A build-tool-specific convention like `GOARCH`, however common, is one opinion among several (Rust target triples, Debian's `dpkg --print-architecture`, and others each spell this differently too), and baking it in as the _default_ — rather than one of the offered presets — quietly favors that one ecosystem's convention over the OS-native one for every project that doesn't think to override it. Keeping the OS-reported name as the default and offering `amd64`/`arm64` as a preset (for projects that do follow that convention) keeps the default neutral while still making the common case one selection away. Not selected as the default; kept as a preset.

## Consequences

### Positive Consequences

- `installerer` does not need to grow special cases for every architecture-naming convention; unrecognized conventions are expressible directly as a validated custom label.
- The runtime architecture set the installer can detect (`x86_64`, `aarch64`) stays fixed, small, and audit-friendly, independent of any project's release-asset naming choices.
- The variable dependency graph's existing validation rules (`archive-filename-context`, `shell-literal-context`) automatically cover custom architecture labels with no new rule, because `asset_arch_label` is wired into the graph as a real node rather than treated as a special case.
- Existing distribution patterns that publish a single asset for multiple architectures (e.g. `universal` builds) remain expressible without a validation error.

### Negative Consequences

- `TargetArch`'s `"arm64"` value is renamed to `"aarch64"` to serve as the canonical value, requiring existing `targets` config (`{ os, arch }` entries) written with `"arm64"` to be updated to `"aarch64"`. Because the default `architectureLabels` mapping is now the identity mapping on the canonical value, this rename also changes the default asset name for what were `arm64` targets to `aarch64` for configs that don't pin `architectureLabels` explicitly — the same underlying rename surfaces in both the config schema and, by default, the generated asset name.
- Projects whose Release assets already use the `amd64`/`arm64` (`GOARCH`-style) convention — a common case, since it's the default for `goreleaser` and widely copied by other tools — must now set `architectureLabels` explicitly instead of getting a matching default for free.
- The config schema and generated script both grow one more moving part (`architectureLabels`, `resolve_asset_arch_label()`), increasing the surface documented in `generated-installer-runtime.md` and the dependency graph doc.

### Neutral Consequences

- The default asset name for `x86_64` targets is unchanged (`x86_64`), since the identity default preserves what the generator already did before `architectureLabels` existed.
- Projects that want the `GOARCH`-style convention can get it by explicitly setting `architectureLabels: { x86_64: "amd64", aarch64: "arm64" }` — also offered as the non-default preset in the browser form.
- `os`/`target` placeholder casing (`archive.osCase`) is unaffected; this ADR only changes architecture, not OS, rendering.
