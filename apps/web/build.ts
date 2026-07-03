import tailwind from "bun-plugin-tailwind";
import { cp } from "node:fs/promises";
import { copyFile } from "node:fs/promises";
import { rm } from "node:fs/promises";
import path from "node:path";

// Web build support is owned by apps/web (issue #100). Paths are resolved
// from this file's location, not process.cwd(), so the build works both via
// the root orchestration script (`bun run build`) and directly in apps/web.
const packageRoot = import.meta.dir;
const repoRoot = path.join(packageRoot, "..", "..");
const outdir = path.join(packageRoot, "dist");
await rm(outdir, { recursive: true, force: true });

function resolveCommitHash(): string {
  const result = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"], { cwd: packageRoot });
  if (result.exitCode !== 0) {
    return "unknown";
  }
  return result.stdout.toString().trim() || "unknown";
}
process.env.BUN_PUBLIC_COMMIT_HASH ??= resolveCommitHash();

const entrypoints = [...new Bun.Glob("src/**/*.html").scanSync(packageRoot)].map((entry) =>
  path.join(packageRoot, entry),
);
const staticFiles = [
  {
    // Repository-level license inventory, served by the Web app as /licenses.txt.
    source: path.join(repoRoot, "THIRD_PARTY_LICENSES.txt"),
    destination: "licenses.txt",
  },
];

const result = await Bun.build({
  entrypoints,
  outdir,
  plugins: [tailwind],
  minify: true,
  target: "browser",
  env: "BUN_PUBLIC_*",
  naming: {
    entry: "[dir]/[name].[ext]",
    chunk: "chunks/[name]-[hash].[ext]",
    asset: "chunks/[name]-[hash].[ext]",
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env.BUN_PUBLIC_COMMIT_HASH": JSON.stringify(process.env.BUN_PUBLIC_COMMIT_HASH),
  },
});

await cp(path.join(packageRoot, "public"), outdir, {
  recursive: true,
  force: true,
});
for (const file of staticFiles) {
  await copyFile(file.source, path.join(outdir, file.destination));

  console.log(` dist/${file.destination}`);
}

for (const output of result.outputs) {
  console.log(` ${path.relative(packageRoot, output.path)}  ${(output.size / 1024).toFixed(1)} KB`);
}
