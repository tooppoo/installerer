/**
 * Typed runtime dependency definitions for the generated installer (issue #75).
 *
 * These types carry semantic dependency information and a declarative check
 * strategy only — never raw shell. Web UI, the reusable Text/JSON renderers,
 * and the generated installer's `--requirements` / `--check-requirements`
 * all derive their content from a single `ResolvedRuntimeDependencies` value.
 */
export type RuntimeDependencyCheck =
  | { type: "command"; command: string }
  | { type: "all-commands"; commands: string[] }
  | { type: "any-command"; commands: string[] };

export type RuntimeDependencyDefinition = {
  id: string;
  label: string;
  reason: string;
  check: RuntimeDependencyCheck;
};

/**
 * Runtime premise categories: conditions the installer relies on but does not
 * (or cannot) check with a command-existence probe.
 */
export type RuntimePremise = "shell" | "network" | "filesystem";

export type RuntimePremiseEntry = {
  id: string;
  premise: RuntimePremise;
  label: string;
  description: string;
};

export type ResolvedRuntimeDependencies = {
  dependencies: RuntimeDependencyDefinition[];
  premises: RuntimePremiseEntry[];
};
