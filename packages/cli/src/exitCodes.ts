/**
 * Stable exit code contract for the installerer CLI: one value per distinct
 * error cause, not one shared "generic error" code. Once a cause ships with
 * a value, that value must not be reused or renumbered; new causes get a
 * new value. The user-facing table in docs/reference/exit-codes.md is generated from this file; see
 * docs/adr/20260703T132416Z_cli-exit-code-contract.md for the rationale.
 */
export const CliExitCode = {
  success: 0,
  unknownCommand: 1,
  unknownOption: 2,
  configFileAlreadyExists: 3,
  configFileWriteFailed: 4,
  configValidationFailed: 5,
  invalidConfigSyntax: 6,
  configFileReadFailed: 7,
  invalidValidateArguments: 8,
  invalidGenerateArguments: 9,
  outputFileWriteFailed: 10,
  /**
   * `generate` (#89) reserves this for a `generateInstaller` throw after `validateInstallerConfigKdl` already reported `ok: true`.
   * `generateInstaller`'s full call chain (`createRenderContext` + `composeInstallerScript`, see `generatedInstaller/index.ts`/`renderContext.ts`) has a handful of `throw` sites: `createRenderContext`'s own `parseArchiveNameTemplate` call, plus ones in `generatedInstaller/sections/dependencies.ts` and `runtimeDependencies/resolve.ts`'s `assertSafeCommandName`.
   * Every one of them guards a static, hard-coded dependency/template definition, not a value drawn from `InstallerConfig`; `validateInstallerConfig` additionally rejects any `archive.nameTemplate` `parseArchiveNameTemplate` itself cannot parse (see `installerConfig.ts`).
   * So a validated config has no known path to this code today; it exists as a named, stable cause for `generate`'s own catch block rather than folding an unexpected generator throw into an unrelated exit code.
   */
  installerGenerationFailed: 11,
  invalidDoctorArguments: 12,
} as const;

export type CliExitCode = (typeof CliExitCode)[keyof typeof CliExitCode];
