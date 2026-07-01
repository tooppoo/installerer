import "./index.css";

import { useMemo, useState } from "react";

import { validateInstallerConfig } from "./installerConfig";
import { generateInstaller } from "./installerGenerator";
import {
  ARCHIVE_FORMAT,
  buildInstallerConfig,
  CHECKSUM_ALGORITHM,
  initialFormState,
  isTargetSelected,
  TARGET_OPTIONS,
  targetKey,
  toggleTarget,
  VERSION_RESOLVER_DESCRIPTIONS,
  VERSION_RESOLVER_OPTIONS,
  versionResolverExample,
  type InstallerFormState,
  type TargetOption,
} from "./installerForm";

const fieldClassName =
  "border border-[#6f786e] bg-white px-3 py-2 font-mono text-sm text-[#171717] outline-none focus:border-[#235b4d] focus:ring-2 focus:ring-[#93c7b8]";
const readOnlyFieldClassName = `${fieldClassName} bg-[#eef0ec] text-[#4a4037]`;
const labelClassName = "flex flex-col gap-1 text-sm font-semibold text-[#4a4037]";

export function App() {
  const [form, setForm] = useState<InstallerFormState>(initialFormState);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  const resolverExample = useMemo(() => versionResolverExample(form), [form]);
  const configForCore = useMemo(() => buildInstallerConfig(form), [form]);
  const configJson = useMemo(() => JSON.stringify(configForCore, null, 2), [configForCore]);
  const result = useMemo(() => validateInstallerConfig(configForCore), [configForCore]);

  // Generation runs only on a validated config; capture any generation error so we
  // never fall back to a previously generated installer as if it were current output.
  const generation = useMemo(() => {
    if (!result.ok) {
      return { installer: null as string | null, error: null as string | null };
    }
    try {
      return { installer: generateInstaller(result.config), error: null };
    } catch (error) {
      return {
        installer: null,
        error: error instanceof Error ? error.message : "Failed to generate installer.",
      };
    }
  }, [result]);

  const installer = generation.installer;

  const update = <Key extends keyof InstallerFormState>(
    key: Key,
    value: InstallerFormState[Key],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const onCopy = async () => {
    if (installer === null) {
      return;
    }
    try {
      await navigator.clipboard.writeText(installer);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
    window.setTimeout(() => setCopyState("idle"), 2000);
  };

  const statusOk = result.ok && generation.error === null;

  return (
    <main className="min-h-screen w-full bg-[#f4f6f1] text-[#171717]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-6 md:px-8">
        <header className="flex flex-col gap-2 border-b border-[#b8c0b0] pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-[#235b4d]">installerer</p>
            <h1 className="mt-1 text-3xl font-bold md:text-4xl">Installer Generator</h1>
            <p className="mt-2 max-w-2xl text-sm text-[#4a4037]">
              Fill in the form to generate a POSIX <code>install.sh</code>. Copy the output and save
              it as <code>install.sh</code>. POSIX shell behavior, download, checksum verification,
              and version-file resolution are the generated installer&apos;s responsibility — this
              page never calls GitHub or fetches a <code>VERSION</code> asset.
            </p>
          </div>
          <div
            className={[
              "w-fit border px-3 py-1.5 text-sm font-semibold",
              statusOk
                ? "border-[#287047] bg-[#e2f2df] text-[#174c2e]"
                : "border-[#9d2d25] bg-[#f8dfda] text-[#762119]",
            ].join(" ")}
          >
            {statusOk
              ? "Installer ready"
              : result.ok
                ? "Generation error"
                : `${result.errors.length} validation error(s)`}
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)]">
          <form className="flex flex-col gap-4" onSubmit={(event) => event.preventDefault()}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClassName}>
                owner
                <input
                  className={fieldClassName}
                  value={form.owner}
                  onChange={(event) => update("owner", event.target.value)}
                  spellCheck={false}
                />
              </label>
              <label className={labelClassName}>
                repo
                <input
                  className={fieldClassName}
                  value={form.repo}
                  onChange={(event) => update("repo", event.target.value)}
                  spellCheck={false}
                />
              </label>
              <label className={labelClassName}>
                binary.name
                <input
                  className={fieldClassName}
                  value={form.binaryName}
                  onChange={(event) => update("binaryName", event.target.value)}
                  spellCheck={false}
                />
              </label>
              <label className={labelClassName}>
                binary.pathInArchive
                <input
                  className={fieldClassName}
                  value={form.binaryPathInArchive}
                  onChange={(event) => update("binaryPathInArchive", event.target.value)}
                  spellCheck={false}
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClassName}>
                versionResolver.type
                <select
                  className={fieldClassName}
                  value={form.versionResolverType}
                  onChange={(event) =>
                    update(
                      "versionResolverType",
                      event.target.value as InstallerFormState["versionResolverType"],
                    )
                  }
                >
                  {VERSION_RESOLVER_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <span className="text-xs font-normal leading-snug text-[#6d625a]">
                  {VERSION_RESOLVER_DESCRIPTIONS[form.versionResolverType]}
                </span>
              </label>
              {form.versionResolverType === "release_version_file" ? (
                <label className={labelClassName}>
                  versionResolver.fileName
                  <input
                    className={fieldClassName}
                    value={form.versionResolverFileName}
                    onChange={(event) => update("versionResolverFileName", event.target.value)}
                    spellCheck={false}
                  />
                </label>
              ) : null}
            </div>

            <div className="border border-[#cdd6c6] bg-[#f0f4ec] p-3 text-xs">
              <div className="font-semibold text-[#4a4037]">Example resolution</div>
              <ol className="mt-1.5 flex flex-col gap-1.5">
                {resolverExample.map((step, index) => (
                  <li key={index} className="flex flex-col gap-0.5">
                    <span className="text-[#6d625a]">{step.label}</span>
                    <code className="break-all font-mono text-[#235b4d]">{step.url}</code>
                  </li>
                ))}
              </ol>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClassName}>
                archive.format
                <input className={readOnlyFieldClassName} value={ARCHIVE_FORMAT} readOnly />
              </label>
              <label className={labelClassName}>
                archive.nameTemplate
                <input
                  className={fieldClassName}
                  value={form.archiveNameTemplate}
                  onChange={(event) => update("archiveNameTemplate", event.target.value)}
                  spellCheck={false}
                />
              </label>
              <label className={labelClassName}>
                checksum.fileName
                <input
                  className={fieldClassName}
                  value={form.checksumFileName}
                  onChange={(event) => update("checksumFileName", event.target.value)}
                  spellCheck={false}
                />
              </label>
              <label className={labelClassName}>
                checksum.algorithm
                <input className={readOnlyFieldClassName} value={CHECKSUM_ALGORITHM} readOnly />
              </label>
            </div>

            <fieldset className="flex flex-col gap-2 border border-[#aeb8a8] p-3">
              <legend className="px-1 text-sm font-semibold text-[#4a4037]">targets</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {TARGET_OPTIONS.map((option: TargetOption) => (
                  <label
                    key={targetKey(option)}
                    className="flex items-center gap-2 font-mono text-sm text-[#171717]"
                  >
                    <input
                      type="checkbox"
                      checked={isTargetSelected(form, option)}
                      onChange={() => setForm((current) => toggleTarget(current, option))}
                    />
                    {targetKey(option)}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className={labelClassName}>
              defaults.installDir
              <input
                className={fieldClassName}
                value={form.installDir}
                onChange={(event) => update("installDir", event.target.value)}
                spellCheck={false}
              />
            </label>
          </form>

          <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-[#4a4037]">Validation</h2>
              {result.ok ? (
                generation.error === null ? (
                  <div className="border border-[#78a86c] bg-[#edf8e9] p-4 text-sm text-[#174c2e]">
                    The config is valid. The generated installer is ready below.
                  </div>
                ) : (
                  <div className="border border-[#d1887f] bg-[#fff4f1] p-3 text-sm">
                    <div className="font-semibold text-[#762119]">Generation error</div>
                    <div className="mt-1 whitespace-pre-wrap text-[#3b2f2a]">
                      {generation.error}
                    </div>
                  </div>
                )
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

            <details className="border border-[#aeb8a8] bg-white">
              <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-[#4a4037]">
                Generated JSON config (read-only)
              </summary>
              <pre className="max-h-[320px] overflow-auto border-t border-[#aeb8a8] bg-[#211d1a] p-4 font-mono text-xs leading-5 text-[#f7f3ea]">
                {configJson}
              </pre>
            </details>
          </div>
        </section>

        {statusOk && installer !== null ? (
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#4a4037]">Generated install.sh</h2>
              <button
                type="button"
                onClick={onCopy}
                className="border border-[#287047] bg-[#e2f2df] px-4 py-1.5 text-sm font-semibold text-[#174c2e] transition-colors hover:bg-[#d0ebca]"
              >
                {copyState === "copied"
                  ? "Copied!"
                  : copyState === "error"
                    ? "Copy failed"
                    : "Copy"}
              </button>
            </div>
            <textarea
              value={installer}
              readOnly
              spellCheck={false}
              className="min-h-[520px] resize-y border border-[#4d5c57] bg-[#111816] p-4 font-mono text-xs leading-5 text-[#e9f0ea] outline-none"
            />
          </section>
        ) : null}
      </div>
    </main>
  );
}

export default App;
