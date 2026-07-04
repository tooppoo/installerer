import packageJson from "../../../package.json" with { type: "json" };

/**
 * Canonical installerer CLI version, sourced from the repository root
 * `package.json` `version` field
 * (docs/adr/20260703T133536Z_cli-version-source.md). This is a static import,
 * not a filesystem read at runtime, so both the npm build and the Bun-compiled
 * standalone executable inline the same value at build time.
 */
export const cliVersion: string = packageJson.version;
