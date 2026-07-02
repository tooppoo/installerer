/**
 * Local fixture HTTP server for generated-installer runtime e2e tests
 * (issue #13). It stands in for GitHub Release asset downloads without any
 * real GitHub Release, accepting the same URL path shape GitHub uses:
 *
 *   /{owner}/{repo}/releases/latest/download/{asset}
 *   /{owner}/{repo}/releases/download/{version}/{asset}
 *
 * Assets are registered per release. Every request is recorded in
 * `requestLog` so tests can assert that exactly the expected requests — and
 * nothing else — were made per resolver/mode.
 */

export const RELEASE_ASSET_PATH_SHAPE =
  /^\/[^/]+\/[^/]+\/releases\/(?:latest\/download\/[^/]+|download\/[^/]+\/[^/]+)$/;

export type FixtureRelease = Map<string, Uint8Array>;

export type FixtureServer = {
  /** http://127.0.0.1:{port} — the test-only replacement for https://github.com */
  baseUrl: string;
  /** Decoded pathname of every request, in arrival order. */
  requestLog: string[];
  /** Registers or replaces the release assets served for `latest/download`. */
  setLatestRelease(owner: string, repo: string, assets: Record<string, Uint8Array | string>): void;
  /** Registers or replaces the release assets served for a tagged release. */
  setTaggedRelease(
    owner: string,
    repo: string,
    tag: string,
    assets: Record<string, Uint8Array | string>,
  ): void;
  clear(): void;
  stop(): void;
};

export function startFixtureServer(): FixtureServer {
  const releases = new Map<string, FixtureRelease>();
  const requestLog: string[] = [];

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const pathname = decodeURIComponent(new URL(request.url).pathname);
      requestLog.push(pathname);

      const asset = lookupAsset(releases, pathname);
      if (!asset) {
        return new Response("not found", { status: 404 });
      }
      return new Response(asset.slice(), {
        headers: { "content-type": "application/octet-stream" },
      });
    },
  });

  const toRelease = (assets: Record<string, Uint8Array | string>): FixtureRelease =>
    new Map(
      Object.entries(assets).map(([name, body]) => [
        name,
        typeof body === "string" ? new TextEncoder().encode(body) : body,
      ]),
    );

  return {
    baseUrl: `http://127.0.0.1:${server.port}`,
    requestLog,
    setLatestRelease(owner, repo, assets) {
      releases.set(`${owner}/${repo}@latest`, toRelease(assets));
    },
    setTaggedRelease(owner, repo, tag, assets) {
      releases.set(`${owner}/${repo}@tag:${tag}`, toRelease(assets));
    },
    clear() {
      releases.clear();
      requestLog.length = 0;
    },
    stop() {
      server.stop(true);
    },
  };
}

function lookupAsset(
  releases: Map<string, FixtureRelease>,
  pathname: string,
): Uint8Array | undefined {
  // Only the GitHub Release download path shape is served; anything else is a
  // 404 that also shows up in the request log for the boundary assertions.
  const segments = pathname.split("/").slice(1);

  if (segments.length === 6 && segments[2] === "releases") {
    const [owner, repo, , third, fourth, asset] = segments;
    if (owner === undefined || repo === undefined || asset === undefined) {
      return undefined;
    }
    if (third === "latest" && fourth === "download") {
      return releases.get(`${owner}/${repo}@latest`)?.get(asset);
    }
    if (third === "download" && fourth !== undefined) {
      return releases.get(`${owner}/${repo}@tag:${fourth}`)?.get(asset);
    }
  }

  return undefined;
}
