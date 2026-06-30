import "./index.css";

import { useMemo, useState } from "react";

import { parseInstallerConfig } from "./installerConfig";
import { generateInstaller } from "./installerGenerator";

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
    installDir: "$HOME/.local/bin",
  },
};

export function App() {
  const [jsonInput, setJsonInput] = useState(() => JSON.stringify(sampleConfig, null, 2));
  const result = useMemo(() => parseInstallerConfig(jsonInput), [jsonInput]);
  const output = result.ok ? JSON.stringify(result.config, null, 2) : "";
  const installer = result.ok ? generateInstaller(result.config) : "";

  return (
    <main className="min-h-screen w-full bg-[#f4f6f1] text-[#171717]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 md:px-8">
        <header className="flex flex-col gap-2 border-b border-[#b8c0b0] pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-[#235b4d]">installerer</p>
            <h1 className="mt-1 text-3xl font-bold md:text-4xl">Installer Generator</h1>
          </div>
          <div
            className={[
              "w-fit border px-3 py-1.5 text-sm font-semibold",
              result.ok
                ? "border-[#287047] bg-[#e2f2df] text-[#174c2e]"
                : "border-[#9d2d25] bg-[#f8dfda] text-[#762119]",
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
              onChange={(event) => setJsonInput(event.target.value)}
              spellCheck={false}
              className="min-h-[420px] flex-1 resize-y border border-[#6f786e] bg-white p-4 font-mono text-sm leading-6 text-[#171717] outline-none focus:border-[#235b4d] focus:ring-2 focus:ring-[#93c7b8]"
            />
          </label>

          <div className="flex min-h-[420px] flex-col gap-4">
            <section className="flex min-h-[220px] flex-col gap-2">
              <h2 className="text-sm font-semibold text-[#4a4037]">Validation</h2>
              {result.ok ? (
                <div className="border border-[#78a86c] bg-[#edf8e9] p-4 text-sm text-[#174c2e]">
                  The JSON input is valid. Archive template expansion, mode-specific dependency
                  graphs, and installer generation are ready.
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {result.errors.map((error, index) => (
                    <li
                      key={`${error.path}-${index}`}
                      className="border border-[#d1887f] bg-[#fff4f1] p-3 text-sm"
                    >
                      <div className="font-mono font-semibold text-[#762119]">{error.path}</div>
                      <div className="mt-1 text-[#3b2f2a]">{error.reason}</div>
                      {error.expected ? (
                        <div className="mt-1 text-[#6d625a]">Expected: {error.expected}</div>
                      ) : null}
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

        {result.ok ? (
          <section className="grid gap-4 lg:grid-cols-[minmax(320px,0.7fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-4">
              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold text-[#4a4037]">Archive Filename Preview</h2>
                <ul className="grid gap-2">
                  {result.archivePreviews.map((preview) => (
                    <li
                      key={`${preview.os}-${preview.arch}`}
                      className="border border-[#aeb8a8] bg-white p-3 font-mono text-sm"
                    >
                      <div className="font-semibold text-[#235b4d]">
                        {preview.os}/{preview.arch}
                      </div>
                      <div className="mt-1 break-all">{preview.latestName}</div>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold text-[#4a4037]">Warnings</h2>
                {result.warnings.length === 0 ? (
                  <div className="border border-[#aeb8a8] bg-white p-3 text-sm text-[#34423c]">
                    No warnings.
                  </div>
                ) : (
                  <ul className="grid gap-2">
                    {result.warnings.map((warning, index) => (
                      <li
                        key={`${warning.path}-${index}`}
                        className="border border-[#d3a441] bg-[#fff8df] p-3 text-sm"
                      >
                        <div className="font-mono font-semibold text-[#664800]">{warning.path}</div>
                        <div className="mt-1">{warning.reason}</div>
                        <div className="mt-1 text-[#665b36]">
                          Recommended: {warning.recommended}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <label className="flex min-h-[520px] flex-col gap-2">
              <span className="text-sm font-semibold text-[#4a4037]">Generated install.sh</span>
              <textarea
                value={installer}
                readOnly
                spellCheck={false}
                className="min-h-[520px] flex-1 resize-y border border-[#4d5c57] bg-[#111816] p-4 font-mono text-xs leading-5 text-[#e9f0ea] outline-none"
              />
            </label>
          </section>
        ) : null}
      </div>
    </main>
  );
}

export default App;
