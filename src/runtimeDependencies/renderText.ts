import type {
  ResolvedRuntimeDependencies,
  RuntimeDependencyDefinition,
  RuntimePremiseEntry,
} from "./model";

export function formatPremiseLine(premise: RuntimePremiseEntry): string {
  return `- ${premise.label}: ${premise.description}`;
}

export function formatDependencyLine(dependency: RuntimeDependencyDefinition): string {
  return `- ${dependency.label}: ${dependency.reason}`;
}

export function renderRuntimeRequirementsText(resolved: ResolvedRuntimeDependencies): string {
  const shellPremises = resolved.premises.filter((premise) => premise.premise === "shell");
  const networkPremises = resolved.premises.filter((premise) => premise.premise === "network");
  const filesystemPremises = resolved.premises.filter(
    (premise) => premise.premise === "filesystem",
  );

  const sections: string[][] = [["Runtime requirements for this installer:"]];

  if (shellPremises.length > 0) {
    sections.push(["Runtime premise:", ...shellPremises.map(formatPremiseLine)]);
  }

  if (resolved.dependencies.length > 0) {
    sections.push(["Required commands:", ...resolved.dependencies.map(formatDependencyLine)]);
  }

  if (networkPremises.length > 0) {
    sections.push(["Network:", ...networkPremises.map(formatPremiseLine)]);
  }

  if (filesystemPremises.length > 0) {
    sections.push(["Filesystem:", ...filesystemPremises.map(formatPremiseLine)]);
  }

  return `${sections.map((section) => section.join("\n")).join("\n\n")}\n`;
}
