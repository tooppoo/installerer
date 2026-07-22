import { describe, expect, test } from "bun:test";

import {
  ensureShebang,
  findBrowserUiReferences,
  findBunRuntimeReferences,
  NODE_SHEBANG,
  preparePublishManifest,
} from "./npmPublishDir";

describe("ensureShebang", () => {
  test("prepends the node shebang when missing", () => {
    expect(ensureShebang("console.log(1);\n")).toBe(`${NODE_SHEBANG}console.log(1);\n`);
  });

  test("leaves an existing shebang untouched", () => {
    const source = "#!/usr/bin/env node\nconsole.log(1);\n";
    expect(ensureShebang(source)).toBe(source);
  });
});

describe("findBunRuntimeReferences", () => {
  test("detects Bun global usage", () => {
    expect(findBunRuntimeReferences('const f = Bun.file("x");')).toEqual(["Bun.f"]);
  });

  test("detects bun: module specifiers", () => {
    expect(findBunRuntimeReferences('import { spawn } from "bun:test";')).toEqual(['"bun:test"']);
  });

  test("returns no findings for clean Node.js source", () => {
    expect(findBunRuntimeReferences('import { parseArgs } from "node:util";')).toEqual([]);
  });
});

describe("findBrowserUiReferences", () => {
  test("detects a bare react-dom import", () => {
    expect(findBrowserUiReferences('import "react-dom";')).toEqual(['import "react-dom"']);
  });

  test("detects a named react import", () => {
    expect(findBrowserUiReferences(`import { useState } from 'react';`)).toEqual(["from 'react'"]);
  });

  test("detects a require() of react-dom/client", () => {
    expect(findBrowserUiReferences('const c = require("react-dom/client");')).toEqual([
      'require("react-dom/client"',
    ]);
  });

  test("returns no findings for CLI-only source", () => {
    expect(findBrowserUiReferences('import { parseArgs } from "node:util";')).toEqual([]);
  });

  test("does not false-positive on 'react-dom' appearing as inlined JSON data", () => {
    // packages/cli/src/version.ts imports the repository root package.json
    // for its `version` field, and Bun.build inlines that JSON into the bundle.
    // A literal object key like `"react-dom": "^19"` is not an import and
    // must not be flagged.
    const inlinedPackageJson = `var package_default = {
      name: "@philomagi/installerer",
      dependencies: {
        react: "^19",
        "react-dom": "^19"
      }
    };`;
    expect(findBrowserUiReferences(inlinedPackageJson)).toEqual([]);
  });
});

describe("preparePublishManifest", () => {
  test("keeps static metadata and strips workspace-only fields", () => {
    const manifest = preparePublishManifest(
      {
        $schema: "https://example.com/package.schema.json",
        name: "@philomagi/installerer",
        version: "0.0.0-package",
        bin: { installerer: "./bin/installerer.js" },
        engines: { node: ">=22.0.0" },
        scripts: { build: "bun run scripts/build-npm.ts" },
        devDependencies: { "@installerer/core": "workspace:*" },
      },
      "1.2.3",
    );

    expect(manifest.name).toBe("@philomagi/installerer");
    expect(manifest.version).toBe("1.2.3");
    expect(manifest.bin).toEqual({ installerer: "./bin/installerer.js" });
    expect(manifest.engines).toEqual({ node: ">=22.0.0" });
    expect(manifest.$schema).toBeUndefined();
    expect(manifest.scripts).toBeUndefined();
    expect(manifest.devDependencies).toBeUndefined();
  });

  test("does not mutate the input manifest", () => {
    const input = { name: "x", scripts: { a: "b" } };
    preparePublishManifest(input, "1.2.3");
    expect(input.scripts).toEqual({ a: "b" });
  });
});
