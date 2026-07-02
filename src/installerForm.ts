import {
  expandArchiveNameTemplate,
  parseArchiveNameTemplate,
  type ArchiveFormat,
} from "./archiveTemplate";
import type { OsCase, TargetArch, TargetOS } from "./installerConfig";

/**
 * Browser form state for the installer generator UI.
 *
 * The form is a thin adapter: it collects user input, then `buildInstallerConfig`
 * turns it into the JSON config object handed to the generator core. The form does
 * not re-implement validation — the generator core remains the source of truth.
 *
 * `checksum.algorithm` is fixed to `sha256` and `defaults.version` is intentionally
 * not part of the form (see issue #8).
 */
export type VersionResolverType = "release_version_file" | "latest_asset";

export type TargetOption = {
  os: TargetOS;
  arch: TargetArch;
};

export type InstallerFormState = {
  owner: string;
  repo: string;
  binaryName: string;
  binaryPathInArchive: string;
  versionResolverType: VersionResolverType;
  versionResolverFileName: string;
  archiveFormat: ArchiveFormat;
  archiveNameTemplate: string;
  archiveOsCase: OsCase;
  checksumFileName: string;
  targets: TargetOption[];
  installDir: string;
};

export const TARGET_OPTIONS: readonly TargetOption[] = [
  { os: "linux", arch: "x86_64" },
  { os: "linux", arch: "aarch64" },
  { os: "darwin", arch: "x86_64" },
  { os: "darwin", arch: "aarch64" },
];

export const VERSION_RESOLVER_OPTIONS: readonly VersionResolverType[] = [
  "release_version_file",
  "latest_asset",
];

/** Short, human-readable description of each version resolver, shown next to the select. */
export const VERSION_RESOLVER_DESCRIPTIONS: Record<VersionResolverType, string> = {
  release_version_file:
    "Reads a VERSION file from the latest release to resolve the tag, then downloads that tag's assets.",
  latest_asset:
    "Downloads assets straight from the latest release. No VERSION file; templates must be versionless.",
};

export const ARCHIVE_FORMAT_OPTIONS: readonly ArchiveFormat[] = ["tar.gz", "zip"];

export const OS_CASE_OPTIONS: readonly OsCase[] = ["lowercase", "capitalized"];

/** Example {os} rendering for each case option, shown as a hint next to the select. */
export const OS_CASE_EXAMPLES: Record<OsCase, string> = {
  lowercase: "linux, darwin",
  capitalized: "Linux, Darwin",
};

/** Expected filename suffix for each archive format, shown as a hint next to the select. */
export const ARCHIVE_FORMAT_SUFFIXES: Record<ArchiveFormat, string> = {
  "tar.gz": ".tar.gz",
  zip: ".zip",
};

/**
 * Archive-format-specific runtime dependency of the generated installer, shown as a
 * hint next to the select. Must stay consistent with the generated installer's
 * dependency checks and docs/installer-contract.md.
 */
export const ARCHIVE_FORMAT_RUNTIME_DEPENDENCIES: Record<ArchiveFormat, string> = {
  "tar.gz": "tar",
  zip: "unzip",
};

export const CHECKSUM_ALGORITHM = "sha256" as const;

export const initialFormState: InstallerFormState = {
  owner: "tooppoo",
  repo: "rellog",
  binaryName: "rellog",
  binaryPathInArchive: "rellog",
  versionResolverType: "release_version_file",
  versionResolverFileName: "VERSION",
  archiveFormat: "tar.gz",
  archiveNameTemplate: "{repo}_{version}_{os}_{arch}.tar.gz",
  archiveOsCase: "lowercase",
  checksumFileName: "checksums.txt",
  targets: [
    { os: "linux", arch: "x86_64" },
    { os: "linux", arch: "aarch64" },
    { os: "darwin", arch: "x86_64" },
    { os: "darwin", arch: "aarch64" },
  ],
  installDir: "$HOME/.local/bin",
};

export function targetKey(target: TargetOption): string {
  return `${target.os}/${target.arch}`;
}

export function isTargetSelected(form: InstallerFormState, target: TargetOption): boolean {
  return form.targets.some((selected) => targetKey(selected) === targetKey(target));
}

export function toggleTarget(form: InstallerFormState, target: TargetOption): InstallerFormState {
  if (isTargetSelected(form, target)) {
    return {
      ...form,
      targets: form.targets.filter((selected) => targetKey(selected) !== targetKey(target)),
    };
  }

  // Keep the canonical TARGET_OPTIONS order so the generated config is stable.
  const next = [...form.targets, target];
  return {
    ...form,
    targets: TARGET_OPTIONS.filter((option) =>
      next.some((selected) => targetKey(selected) === targetKey(option)),
    ),
  };
}

export type ResolverExampleStep = {
  label: string;
  url: string;
};

/** Version used only to illustrate a resolved-tag download URL in the resolver example. */
const EXAMPLE_RESOLVED_VERSION = "v1.2.3";

/**
 * Build a small, concrete illustration of how the selected resolver turns the current
 * form values into GitHub download URLs. Purely for display — it never fetches anything.
 */
export function versionResolverExample(form: InstallerFormState): ResolverExampleStep[] {
  const owner = form.owner || "OWNER";
  const repo = form.repo || "REPO";
  const target = form.targets[0] ?? { os: "linux", arch: "x86_64" };
  const releasesBase = `https://github.com/${owner}/${repo}/releases`;

  const archiveName = (version: string): string => {
    const parsed = parseArchiveNameTemplate(form.archiveNameTemplate);
    if (!parsed.ok) {
      return form.archiveNameTemplate || "<archive>";
    }
    return expandArchiveNameTemplate(parsed.segments, {
      owner,
      repo,
      bin: form.binaryName || "BIN",
      version,
      os: target.os,
      arch: target.arch,
      osCase: form.archiveOsCase,
    });
  };

  if (form.versionResolverType === "release_version_file") {
    const fileName = form.versionResolverFileName || "VERSION";
    return [
      {
        label: `1. Read ${fileName} from the latest release to resolve the tag`,
        url: `${releasesBase}/latest/download/${fileName}`,
      },
      {
        label: `2. Download the asset for the resolved tag (e.g. ${EXAMPLE_RESOLVED_VERSION})`,
        url: `${releasesBase}/download/${EXAMPLE_RESOLVED_VERSION}/${archiveName(EXAMPLE_RESOLVED_VERSION)}`,
      },
    ];
  }

  return [
    {
      label: "Download the asset directly from the latest release",
      url: `${releasesBase}/latest/download/${archiveName("")}`,
    },
  ];
}

/**
 * Build the JSON config object that is handed to the generator core.
 *
 * The returned object is the single source shown in the read-only JSON preview and
 * passed to `validateInstallerConfig`, so the preview always matches what the core
 * receives.
 */
export function buildInstallerConfig(form: InstallerFormState): Record<string, unknown> {
  const versionResolver =
    form.versionResolverType === "release_version_file"
      ? { type: "release_version_file", fileName: form.versionResolverFileName }
      : { type: "latest_asset" };

  return {
    owner: form.owner,
    repo: form.repo,
    binary: {
      name: form.binaryName,
      pathInArchive: form.binaryPathInArchive,
    },
    versionResolver,
    archive: {
      format: form.archiveFormat,
      nameTemplate: form.archiveNameTemplate,
      osCase: form.archiveOsCase,
    },
    checksum: {
      fileName: form.checksumFileName,
      algorithm: CHECKSUM_ALGORITHM,
    },
    targets: form.targets,
    defaults: {
      installDir: form.installDir,
    },
  };
}
