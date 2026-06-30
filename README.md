# bun-react-tailwind-template

## Documentation

- [MVP Browser JS Installer Generator Policy](docs/adr/20260630T032548Z_mvp-browser-js-generator-policy.md)

## JSON config validation

The browser app parses installer JSON, rejects unknown fields at every object level, validates supported resolver,
checksum, target, filename, archive path, default version, and install directory values, then returns a normalized
config for installer generation.

`defaults.version` uses `latest` as the reserved latest-release installer value. Other values are validated as Git tag
names and may include `/`; resolver and URL generation code must encode version strings as URL path segments when they
are embedded in GitHub Release URLs.

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
