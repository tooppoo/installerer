import { serve } from "bun";
import path from "node:path";
import index from "./index.html";

const port = Number(process.env.PORT ?? 3000);
// Repository-level license inventory lives at the repo root, three levels up
// from apps/web/src/.
const licensesPath = path.join(import.meta.dir, "..", "..", "..", "THIRD_PARTY_LICENSES.txt");

const server = serve({
  port,
  routes: {
    // Serve index.html for all unmatched routes.
    "/*": index,

    "/assets/*": publicAssetResponse,

    "/licenses.txt": () =>
      new Response(Bun.file(licensesPath), {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }),
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);

const root = path.join(import.meta.dir, "..");
const publicDir = path.join(root, "public");
function publicAssetResponse(req: Request): Response {
  const url = new URL(req.url);
  const prefix = "/assets/";
  const relativePath = url.pathname.slice(prefix.length);

  // path traversal 防止
  if (
    relativePath.length === 0 ||
    relativePath.includes("\0") ||
    relativePath.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    return new Response("Not Found", { status: 404 });
  }

  const filePath = path.join(publicDir, "assets", relativePath);
  const file = Bun.file(filePath);

  return new Response(file, {
    headers: {
      "Content-Type": contentTypeFor(filePath),
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
function contentTypeFor(filePath: string): string {
  if (filePath.endsWith(".svg")) return "image/svg+xml; charset=utf-8";
  if (filePath.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}
