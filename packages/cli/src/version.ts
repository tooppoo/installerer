import packageJson from "../package.json" with { type: "json" };

/**
 * Canonical installerer CLI version, sourced from the CLI package's own
 * `packages/cli/package.json` `version` field
 * (docs/adr/20260703T133536Z_cli-version-source.md). This is
 * a static import, not a filesystem read at runtime, so both the npm build
 * and the Bun-compiled standalone executable resolve it the same way: the
 * npm build ships package.json alongside the compiled output, and Bun
 * compile inlines the imported JSON value into the binary at build time.
 * Neither runtime needs its own version-lookup logic.
 */
export const cliVersion: string = packageJson.version;
