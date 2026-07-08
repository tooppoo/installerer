/**
 * Stable exit code contract for the installerer CLI: one value per distinct
 * error cause, not one shared "generic error" code. Once a cause ships with
 * a value, that value must not be reused or renumbered; new causes get a
 * new value. See docs/exit-code.md for the user-facing table and
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
} as const;

export type CliExitCode = (typeof CliExitCode)[keyof typeof CliExitCode];
