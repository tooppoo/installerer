import "./index.css";

import { useMemo, useState } from "react";

import { parseInstallerConfig } from "./installerConfig";

const sampleConfig = {
  owner: "tooppoo",
  repo: "rellog",
  binary: {
    name: "rellog",
    pathInArchive: "rellog",
  },
  versionResolver: {
    type: "release_version_file",
    fileName: "VERSION",
  },
  archive: {
    format: "tar.gz",
    nameTemplate: "{repo}_{version}_{os}_{arch}.tar.gz",
  },
  checksum: {
    fileName: "checksums.txt",
    algorithm: "sha256",
  },
  targets: [
    { os: "linux", arch: "x86_64" },
    { os: "linux", arch: "aarch64" },
    { os: "darwin", arch: "x86_64" },
    { os: "darwin", arch: "aarch64" },
  ],
  defaults: {
    version: "latest",
    installDir: "$HOME/.local/bin",
  },
};

export function App() {
  const [jsonInput, setJsonInput] = useState(() => JSON.stringify(sampleConfig, null, 2));
  const result = useMemo(() => parseInstallerConfig(jsonInput), [jsonInput]);
  const output = result.ok ? JSON.stringify(result.config, null, 2) : "";

  return (
    <main className="min-h-screen w-full bg-[#f7f3ea] text-[#171717]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 md:px-8">
        <header className="flex flex-col gap-2 border-b border-[#c9c0b2] pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#7b3f24]">installerer</p>
            <h1 className="mt-1 text-3xl font-bold md:text-4xl">JSON Config Validator</h1>
          </div>
          <div
            className={[
              "w-fit border px-3 py-1.5 text-sm font-semibold",
              result.ok ? "border-[#287047] bg-[#e2f2df] text-[#174c2e]" : "border-[#9d2d25] bg-[#f8dfda] text-[#762119]",
            ].join(" ")}
          >
            {result.ok ? "Valid normalized config" : `${result.errors.length} validation error(s)`}
          </div>
        </header>

        <section className="grid min-h-[640px] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
          <label className="flex min-h-[420px] flex-col gap-2">
            <span className="text-sm font-semibold text-[#4a4037]">Input JSON</span>
            <textarea
              value={jsonInput}
              onChange={event => setJsonInput(event.target.value)}
              spellCheck={false}
              className="min-h-[420px] flex-1 resize-y border border-[#82776a] bg-[#fffaf0] p-4 font-mono text-sm leading-6 text-[#171717] outline-none focus:border-[#7b3f24] focus:ring-2 focus:ring-[#d89a6a]"
            />
          </label>

          <div className="flex min-h-[420px] flex-col gap-4">
            <section className="flex min-h-[220px] flex-col gap-2">
              <h2 className="text-sm font-semibold text-[#4a4037]">Validation</h2>
              {result.ok ? (
                <div className="border border-[#78a86c] bg-[#edf8e9] p-4 text-sm text-[#174c2e]">
                  The JSON input is valid. The normalized config below is ready for installer generation. The
                  default version value <code className="font-mono">latest</code> is reserved for latest-release
                  installer behavior; URL path encoding remains the resolver and URL generation responsibility.
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {result.errors.map((error, index) => (
                    <li key={`${error.path}-${index}`} className="border border-[#d1887f] bg-[#fff4f1] p-3 text-sm">
                      <div className="font-mono font-semibold text-[#762119]">{error.path}</div>
                      <div className="mt-1 text-[#3b2f2a]">{error.reason}</div>
                      {error.expected ? <div className="mt-1 text-[#6d625a]">Expected: {error.expected}</div> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <label className="flex min-h-[320px] flex-1 flex-col gap-2">
              <span className="text-sm font-semibold text-[#4a4037]">Normalized Config</span>
              <textarea
                value={output}
                readOnly
                placeholder="Normalized config appears after successful validation."
                spellCheck={false}
                className="min-h-[320px] flex-1 resize-y border border-[#82776a] bg-[#211d1a] p-4 font-mono text-sm leading-6 text-[#f7f3ea] outline-none placeholder:text-[#b8aa98]"
              />
            </label>
          </div>
        </section>
      </div>
    </main>
  );
}

export default App;
