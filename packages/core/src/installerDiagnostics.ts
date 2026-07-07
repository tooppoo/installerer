import type { ArchiveNamePreview } from "./archiveTemplate";
import { localInstallCommandExamples } from "./installCommandExamples";
import type { InstallerConfig } from "./installerConfig";
import { urlEncodePathSegment } from "./urlPathSegment";

export { urlEncodePathSegment } from "./urlPathSegment";

export type InstallerDiagnostics = {
  typoCommands: string[];
  expectedReleaseAssets: string[];
  urls: {
    latest: string[];
    pinned: string[];
  };
  resolverNotes: string[];
  installCommands: {
    valid: string[];
    invalid: string[];
  };
};

const EXAMPLE_RESOLVED_VERSION = "v1.2.3";
const EXAMPLE_PINNED_VERSION = "v0.1.2";

export function buildInstallerDiagnostics(
  config: InstallerConfig,
  archivePreviews: ArchiveNamePreview[],
): InstallerDiagnostics {
  const base = githubReleasesBase(config);
  const firstArchive = archivePreviews[0]?.latestName ?? "<archive>";
  const latestArchiveUrls = archivePreviews.map(
    (preview) => `${base}/latest/download/${urlEncodePathSegment(preview.latestName)}`,
  );
  const pinnedArchiveUrls = archivePreviews.map(
    (preview) =>
      `${base}/download/${urlEncodePathSegment(EXAMPLE_PINNED_VERSION)}/${urlEncodePathSegment(
        preview.pinnedName,
      )}`,
  );
  const latestChecksumUrl = `${base}/latest/download/${urlEncodePathSegment(config.checksum.fileName)}`;
  const pinnedChecksumUrl = `${base}/download/${urlEncodePathSegment(
    EXAMPLE_PINNED_VERSION,
  )}/${urlEncodePathSegment(config.checksum.fileName)}`;

  if (config.versionResolver.type === "release_version_file") {
    const resolvedBase = `${base}/download/${urlEncodePathSegment(EXAMPLE_RESOLVED_VERSION)}`;

    return {
      typoCommands: [
        `curl -fsIL ${githubRepoUrl(config)} >/dev/null`,
        `curl -fsIL ${base}/latest >/dev/null`,
        `curl -fsIL ${base}/latest/download/${urlEncodePathSegment(
          config.versionResolver.fileName,
        )} >/dev/null`,
      ],
      expectedReleaseAssets: [
        config.versionResolver.fileName,
        config.checksum.fileName,
        ...archivePreviews.map((preview) => preview.latestName),
      ],
      urls: {
        latest: [
          `${base}/latest/download/${urlEncodePathSegment(config.versionResolver.fileName)}`,
          `${resolvedBase}/${urlEncodePathSegment(config.checksum.fileName)}`,
          ...archivePreviews.map(
            (preview) => `${resolvedBase}/${urlEncodePathSegment(preview.latestName)}`,
          ),
        ],
        pinned: [pinnedChecksumUrl, ...pinnedArchiveUrls],
      },
      resolverNotes: [
        "Latest install first reads the version file from the latest release, then downloads assets from the resolved tag.",
        "Pinned install skips the version file and downloads checksum and archive assets from the supplied tag.",
      ],
      installCommands: localInstallCommandExamples(),
    };
  }

  return {
    typoCommands: [
      `curl -fsIL ${githubRepoUrl(config)} >/dev/null`,
      `curl -fsIL ${base}/latest >/dev/null`,
      `curl -fsIL ${base}/latest/download/${urlEncodePathSegment(firstArchive)} >/dev/null`,
    ],
    expectedReleaseAssets: [
      config.checksum.fileName,
      ...archivePreviews.map((preview) => preview.latestName),
    ],
    urls: {
      latest: [latestChecksumUrl, ...latestArchiveUrls],
      pinned: [pinnedChecksumUrl, ...pinnedArchiveUrls],
    },
    resolverNotes: [
      "Latest install downloads checksum and archive assets directly from the latest release.",
      "Pinned install downloads checksum and archive assets from the supplied tag.",
    ],
    installCommands: localInstallCommandExamples(),
  };
}

function githubRepoUrl(config: InstallerConfig) {
  return `https://github.com/${urlEncodePathSegment(config.owner)}/${urlEncodePathSegment(config.repo)}`;
}

function githubReleasesBase(config: InstallerConfig) {
  return `${githubRepoUrl(config)}/releases`;
}
