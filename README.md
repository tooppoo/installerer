# bun-react-tailwind-template

## Documentation

- [MVP Browser JS Installer Generator Policy](docs/adr/20260630T032548Z_mvp-browser-js-generator-policy.md)
- [Generated Installer Runtime](docs/generated-installer-runtime.md)
- [Generated Installer Runtime ADR](docs/adr/20260630T174038Z_generated-installer-runtime-single-posix-sh.md)

## JSON config validation and installer generation

The browser app parses installer JSON, rejects unknown fields at every object level, validates supported resolver,
checksum, target, filename, archive path, archive template, and install directory values, then returns a normalized
config and generated `install.sh`.

Archive filename templates support `{owner}`, `{repo}`, `{bin}`, `{version}`, `{os}`, `{arch}`, and `{target}`.
`{target}` expands to `{os}_{arch}`. Template expansion is single-pass and rejects malformed or unknown placeholders.

The generated installer dispatches latest and pinned installs separately. Omit `--version` for latest installs, or pass
`--version <version>` for a pinned Git tag. `--version latest` is rejected to avoid ambiguity.

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

This project was created using `bun init` in bun v1.3.14. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
