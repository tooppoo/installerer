/**
 * Public API of @installerer/core: the runtime-neutral installer generation
 * core shared by the Web app (apps/web) and the CLI (packages/cli).
 *
 * Consumers may also import individual modules via subpath exports
 * (e.g. `@installerer/core/runtimeDependencies/resolve`); this barrel
 * re-exports the primary entry points: config parsing/validation,
 * diagnostics, and installer generation.
 */
export {
  parseInstallerConfig,
  validateInstallerConfig,
  type ArchitectureLabels,
  type ArchitectureLabelsByOs,
  type InstallerConfig,
  type OsCase,
  type ParseInstallerConfigResult,
  type TargetArch,
  type TargetOS,
  type ValidationError,
} from "./installerConfig";
export {
  checkExpectedReleaseTag,
  type ExpectedReleaseTagCheckInput,
  type ExpectedReleaseTagCheckResult,
  type ExpectedReleaseTagCheckSource,
} from "./expectedReleaseTag";
export { buildInstallCommandExamples, type InstallCommandExamples } from "./installCommandExamples";
export { buildInstallerDiagnostics, type InstallerDiagnostics } from "./installerDiagnostics";
export { generateInstaller, previewArchiveNames } from "./installerGenerator";
export { resolveRuntimeDependencies } from "./runtimeDependencies/resolve";
export {
  parseKdlText,
  type KdlDocument,
  type KdlNode,
  type KdlValue,
  type KdlSourceLocation,
  type KdlSyntaxError,
  type ParseKdlTextResult,
} from "./kdl/parseKdlText";
