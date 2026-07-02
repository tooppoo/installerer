import { serve } from "bun";
import path from "node:path";
import index from "./index.html";

const port = Number(process.env.PORT ?? 3000);
const licensesPath = path.join(import.meta.dir, "..", "THIRD_PARTY_LICENSES.txt");

const server = serve({
  port,
  routes: {
    // Serve index.html for all unmatched routes.
    "/*": index,

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
