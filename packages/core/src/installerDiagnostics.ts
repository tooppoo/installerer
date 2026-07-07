import { parseArchiveNameTemplate, templateUsesPlaceholder } from "./archiveTemplate";
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
  latestInstallNotes: string[];
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

  const templateResult = parseArchiveNameTemplate(config.archive.nameTemplate);
  const hasVersion =
    templateResult.ok && templateUsesPlaceholder(templateResult.segments, "version");

  if (hasVersion) {
    const resolvedBase = `${base}/download/${urlEncodePathSegment(EXAMPLE_RESOLVED_VERSION)}`;

    return {
      typoCommands: [
        `curl -fsIL ${githubRepoUrl(config)} >/dev/null`,
        `curl -fsIL ${base}/latest >/dev/null`,
        `curl -fsIL ${latestChecksumUrl} >/dev/null`,
      ],
      expectedReleaseAssets: [
        config.checksum.fileName,
        ...archivePreviews.map((preview) => preview.latestName),
      ],
      urls: {
        latest: [
          latestChecksumUrl,
          `${resolvedBase}/${urlEncodePathSegment(config.checksum.fileName)}`,
          ...archivePreviews.map(
            (preview) => `${resolvedBase}/${urlEncodePathSegment(preview.latestName)}`,
          ),
        ],
        pinned: [pinnedChecksumUrl, ...pinnedArchiveUrls],
      },
      latestInstallNotes: [
        "Latest install first fetches the checksum file from the latest release as a version-resolution index, extracts the release tag from the matching archive filename, then re-downloads the checksum file and archive from that resolved tag.",
        "Pinned install skips index resolution and downloads checksum and archive assets from the supplied tag.",
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
    latestInstallNotes: [
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
