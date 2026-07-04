/**
 * Repository-local package-boundary check (issue #100).
 *
 * oxlint's `no-restricted-imports` enforces the boundaries for static
 * `import` statements, but its coverage of dynamic `import()` and CommonJS
 * `require()` specifiers is not guaranteed. This small check closes that
 * gap without introducing ESLint as a second primary linter:
 *
 * 1. packages/core source must not reference runtime-specific modules
 *    (Node builtins, Bun, React) or other workspace packages through ANY
 *    specifier form (static import / export-from / dynamic import() /
 *    require()).
 * 2. apps/web source must not reference packages/cli, and packages/cli
 *    source must not reference apps/web (React included).
 * 3. package.json dependency direction: packages/core must not depend on
 *    Web-only or CLI-only packages; apps/web and packages/cli must not
 *    depend on each other.
 *
 * Test files (*.test.ts, test/ directories) run under `bun test` and are
 * exempt from the source checks, matching the oxlint configuration.
 *
 * Usage: bun scripts/ci/check-package-boundaries.ts
 */
import path from "node:path";

const repoRoot = path.join(import.meta.dir, "..", "..");

const NODE_BUILTIN_NAMES = [
  "assert",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "string_decoder",
  "timers",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "worker_threads",
  "zlib",
];

type SpecifierRule = {
  name: string;
  matches: (specifier: string) => boolean;
};

const coreRules: SpecifierRule[] = [
  {
    name: "Node builtin",
    matches: (s) => s.startsWith("node:") || NODE_BUILTIN_NAMES.includes(s.split("/")[0] ?? s),
  },
  {
    name: "Bun API",
    matches: (s) => s === "bun" || s.startsWith("bun:"),
  },
  {
    name: "React / Web UI module",
    matches: (s) =>
      s === "react" || s === "react-dom" || s.startsWith("react/") || s.startsWith("react-dom/"),
  },
  {
    name: "cross-package reference",
    matches: (s) =>
      s === "@installerer/web" ||
      s === "@philomagi/installerer" ||
      s.includes("apps/web") ||
      s.includes("packages/cli"),
  },
];

const webRules: SpecifierRule[] = [
  {
    name: "CLI-only code",
    matches: (s) => s === "@philomagi/installerer" || s.includes("packages/cli"),
  },
];

const cliRules: SpecifierRule[] = [
  {
    name: "Web-only code",
    matches: (s) =>
      s === "@installerer/web" ||
      s === "react" ||
      s === "react-dom" ||
      s.startsWith("react/") ||
      s.startsWith("react-dom/") ||
      s.includes("apps/web"),
  },
];

// Captures the specifier of: import ... from "x", export ... from "x",
// bare `import "x"`, dynamic `import("x")`, and `require("x")`.
const SPECIFIER_PATTERNS = [
  /\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
];

function extractSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) specifiers.push(specifier);
    }
  }
  return specifiers;
}

const violations: string[] = [];

async function checkSourceDir(
  packageDir: string,
  sourceSubdir: string,
  rules: SpecifierRule[],
): Promise<void> {
  const absolutePackageDir = path.join(repoRoot, packageDir);
  const absoluteDir = path.join(absolutePackageDir, sourceSubdir);
  const glob = new Bun.Glob("**/*.{ts,tsx}");
  for await (const entry of glob.scan({ cwd: absoluteDir })) {
    if (entry.endsWith(".test.ts") || entry.endsWith(".test.tsx")) continue;
    const filePath = path.join(absoluteDir, entry);
    const source = await Bun.file(filePath).text();
    for (const specifier of extractSpecifiers(source)) {
      // A relative import must stay inside its own package; reaching out of
      // the package directory bypasses the package-name boundary entirely.
      if (specifier.startsWith(".")) {
        const resolved = path.resolve(path.dirname(filePath), specifier);
        if (path.relative(absolutePackageDir, resolved).startsWith("..")) {
          violations.push(
            `${packageDir}/${sourceSubdir}/${entry}: relative import "${specifier}" escapes ${packageDir}`,
          );
        }
        continue;
      }
      for (const rule of rules) {
        if (rule.matches(specifier)) {
          violations.push(
            `${packageDir}/${sourceSubdir}/${entry}: forbidden ${rule.name} import "${specifier}"`,
          );
        }
      }
    }
  }
}

type PackageManifest = {
  bundleDependencies?: string[] | false;
  bundledDependencies?: string[] | false;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

async function readManifest(relativePath: string): Promise<PackageManifest> {
  return (await Bun.file(path.join(repoRoot, relativePath)).json()) as PackageManifest;
}

function dependencyNameList(names: string[] | false | undefined): string[] {
  return Array.isArray(names) ? names : [];
}

function allDependencyNames(manifest: PackageManifest): string[] {
  return [
    ...dependencyNameList(manifest.bundleDependencies),
    ...dependencyNameList(manifest.bundledDependencies),
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ];
}

function checkDependencies(
  manifestPath: string,
  names: string[],
  forbidden: (name: string) => boolean,
  reason: string,
): void {
  for (const name of names) {
    if (forbidden(name)) {
      violations.push(`${manifestPath}: forbidden dependency "${name}" (${reason})`);
    }
  }
}

const WEB_ONLY_DEPENDENCIES = new Set(["react", "react-dom", "@installerer/web"]);
const CLI_ONLY_DEPENDENCIES = new Set(["@philomagi/installerer"]);

await checkSourceDir("packages/core", "src", coreRules);
await checkSourceDir("apps/web", "src", webRules);
await checkSourceDir("packages/cli", "src", cliRules);

checkDependencies(
  "packages/core/package.json",
  allDependencyNames(await readManifest("packages/core/package.json")),
  (name) =>
    WEB_ONLY_DEPENDENCIES.has(name) ||
    CLI_ONLY_DEPENDENCIES.has(name) ||
    name.startsWith("react") ||
    name === "wrangler" ||
    name.includes("tailwind"),
  "packages/core must stay runtime-neutral and independent of web/cli",
);
checkDependencies(
  "apps/web/package.json",
  allDependencyNames(await readManifest("apps/web/package.json")),
  (name) => CLI_ONLY_DEPENDENCIES.has(name),
  "apps/web must not depend on the CLI package",
);
checkDependencies(
  "packages/cli/package.json",
  allDependencyNames(await readManifest("packages/cli/package.json")),
  (name) => WEB_ONLY_DEPENDENCIES.has(name),
  "packages/cli must not depend on Web-only packages",
);

if (violations.length > 0) {
  console.error("package-boundary violations found:");
  for (const violation of violations) {
    console.error(`  - ${violation}`);
  }
  process.exit(1);
}

console.log("package boundaries: ok");
