import tailwind from "bun-plugin-tailwind";
import { cp } from "node:fs/promises";
import { copyFile } from "node:fs/promises";
import { rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outdir = path.join(process.cwd(), "dist");
await rm(outdir, { recursive: true, force: true });

function resolveCommitHash(): string {
  const result = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"], { cwd: root });
  if (result.exitCode !== 0) {
    return "unknown";
  }
  return result.stdout.toString().trim() || "unknown";
}
process.env.BUN_PUBLIC_COMMIT_HASH ??= resolveCommitHash();

const entrypoints = [...new Bun.Glob("src/**/*.html").scanSync()];
const staticFiles = [
  {
    source: "THIRD_PARTY_LICENSES.txt",
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
  },
});

await cp(path.join(root, "public"), outdir, {
  recursive: true,
  force: true,
});
for (const file of staticFiles) {
  await copyFile(path.join(root, file.source), path.join(outdir, file.destination));

  console.log(` dist/${file.destination}`);
}

for (const output of result.outputs) {
  console.log(
    ` ${path.relative(process.cwd(), output.path)}  ${(output.size / 1024).toFixed(1)} KB`,
  );
}
