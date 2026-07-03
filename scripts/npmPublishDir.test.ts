import { describe, expect, test } from "bun:test";

import {
  buildPublishPackageJson,
  ensureShebang,
  findBrowserUiReferences,
  findBunRuntimeReferences,
  NODE_SHEBANG,
  NPM_CLI_ENGINES,
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
    // src/cli/version.ts imports the whole root package.json for its
    // `version` field, and Bun.build inlines that JSON (including its
    // `dependencies` map) into the bundle. The literal object key
    // `"react-dom": "^19"` is not an import and must not be flagged.
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

describe("buildPublishPackageJson", () => {
  test("carries the root name/version without private/dependencies/scripts", () => {
    const pkg = buildPublishPackageJson({ name: "@philomagi/installerer", version: "1.2.3" });

    expect(pkg.name).toBe("@philomagi/installerer");
    expect(pkg.version).toBe("1.2.3");
    expect(pkg.private).toBeUndefined();
    expect(pkg.dependencies).toBeUndefined();
    expect(pkg.scripts).toBeUndefined();
    expect(pkg.bin).toEqual({ installerer: "./bin/installerer.js" });
    expect(pkg.files).toEqual(["bin"]);
    expect(pkg.engines).toEqual(NPM_CLI_ENGINES);
  });
});
