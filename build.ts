import tailwind from "bun-plugin-tailwind";
import { copyFile } from "node:fs/promises";
import { rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outdir = path.join(process.cwd(), "dist");
await rm(outdir, { recursive: true, force: true });

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
  sourcemap: "linked",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

for (const file of staticFiles) {
  await copyFile(
    path.join(root, file.source),
    path.join(outdir, file.destination),
  );

  console.log(` dist/${file.destination}`);
}

for (const output of result.outputs) {
  console.log(
    ` ${path.relative(process.cwd(), output.path)}  ${(output.size / 1024).toFixed(1)} KB`,
  );
}
