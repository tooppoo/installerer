import type { ArchiveNamePreview, ArchiveTemplateWarning } from "../archiveTemplate";
import type { ContextPropagation, ModeGraph } from "../archiveTemplateValidation";
import { configDiagnosticFromValidationError, type ConfigDiagnostic } from "../configDiagnostics";
import { validateInstallerConfig } from "../installerConfig";
import type { InstallerConfig } from "../installerConfig";
import type { ValidationError } from "../validation";
import { decodeInstallerConfigKdl } from "./installerConfigKdlCodec";
import { domainPathToKdlFacingPath } from "./installerConfigKdlPathMapping";
import type { KdlDocument } from "./parseKdlText";

export type ValidateInstallerConfigKdlResult =
  | {
      ok: true;
      config: InstallerConfig;
      archivePreviews: ArchiveNamePreview[];
      warnings: ArchiveTemplateWarning[];
      dependencyGraphs: ModeGraph[];
      contextPropagations: ContextPropagation[];
    }
  | {
      ok: false;
      diagnostics: ConfigDiagnostic[];
    };

/**
 * Codec/validation boundary (#108): decodes a KDL AST into an
 * `InstallerConfig` input object via `decodeInstallerConfigKdl`, then runs
 * the existing `validateInstallerConfig` semantic rules on it. Kept as a
 * separate function from the codec so "decode KDL shape" and "validate
 * domain semantics" stay two distinct responsibilities, per #108 — the codec
 * never re-implements semantic rules, and this boundary never re-implements
 * KDL shape rules.
 *
 * Codec-phase failures short-circuit before semantic validation runs, since
 * an input object built from an invalid KDL shape would not be meaningful
 * input for `validateInstallerConfig`.
 */
export function validateInstallerConfigKdl(
  document: KdlDocument,
): ValidateInstallerConfigKdlResult {
  const decoded = decodeInstallerConfigKdl(document);

  if (!decoded.ok) {
    return {
      ok: false,
      diagnostics: decoded.errors.map((error) =>
        configDiagnosticFromValidationError(error, { phase: "codec" }),
      ),
    };
  }

  const validated = validateInstallerConfig(decoded.input);

  if (!validated.ok) {
    return {
      ok: false,
      diagnostics: validated.errors.map((error) =>
        configDiagnosticFromValidationError(toKdlFacingError(error), { phase: "semantic" }),
      ),
    };
  }

  return {
    ok: true,
    config: validated.config,
    archivePreviews: validated.archivePreviews,
    warnings: validated.warnings,
    dependencyGraphs: validated.dependencyGraphs,
    contextPropagations: validated.contextPropagations,
  };
}

function toKdlFacingError(error: ValidationError): ValidationError {
  return { ...error, path: domainPathToKdlFacingPath(error.path) };
}
