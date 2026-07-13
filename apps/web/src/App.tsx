import "./index.css";

import { useMemo, useState } from "react";

import packageJson from "../../../package.json";
import {
  checkExpectedReleaseTag,
  type ExpectedReleaseTagCheckResult,
} from "@installerer/core/expectedReleaseTag";
import { buildInstallCommandExamples } from "@installerer/core/installCommandExamples";
import { validateInstallerConfig } from "@installerer/core/installerConfig";
import { buildInstallerDiagnostics } from "@installerer/core/installerDiagnostics";
import { generateInstaller } from "@installerer/core/installerGenerator";
import { resolveRuntimeDependencies } from "@installerer/core/runtimeDependencies/resolve";
import { renderRuntimeRequirementsText } from "@installerer/core/runtimeDependencies/renderText";
import {
  INSTALLER_CONTRACT_MARKDOWN,
  INSTALLER_CONTRACT_SEGMENTS,
} from "./generated/installerContract";
import {
  architectureLabelSelection,
  ARCHITECTURE_LABEL_PRESETS,
  ARCHIVE_FORMAT_OPTIONS,
  ARCHIVE_FORMAT_RUNTIME_DEPENDENCIES,
  ARCHIVE_FORMAT_SUFFIXES,
  buildInstallerConfig,
  CANONICAL_ARCHITECTURES,
  CHECKSUM_ALGORITHM,
  CUSTOM_ARCHITECTURE_LABEL,
  initialFormState,
  isTargetSelected,
  OS_CASE_EXAMPLES,
  OS_CASE_OPTIONS,
  setArchitectureLabelsPerOs,
  TARGET_OPERATING_SYSTEMS,
  TARGET_OPTIONS,
  targetKey,
  toggleTarget,
  type InstallerFormState,
  type TargetOption,
} from "./installerForm";
import type { TargetArch } from "@installerer/core/installerConfig";

// Statically replaced at bundle time (see bunfig.toml `[serve.static].env` for `bun dev`,
// and the `env` option passed to `Bun.build` in build.ts for `bun run build`).
const commitHash = process.env.BUN_PUBLIC_COMMIT_HASH || "unknown";

const fieldClassName =
  "border border-[#6f786e] bg-white px-3 py-2 font-mono text-sm text-[#171717] outline-none focus:border-[#235b4d] focus:ring-2 focus:ring-[#93c7b8]";
const readOnlyFieldClassName = `${fieldClassName} bg-[#eef0ec] text-[#4a4037]`;
const labelClassName = "flex flex-col gap-1 text-sm font-semibold text-[#4a4037]";

export function App() {
  const [form, setForm] = useState<InstallerFormState>(initialFormState);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [contractCopyState, setContractCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [curlCopyState, setCurlCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [tagCheckMode, setTagCheckMode] = useState<"checksum-index" | "archive-filename">(
    "checksum-index",
  );
  const [tagCheckText, setTagCheckText] = useState("");
  const [tagCheckTargetKey, setTagCheckTargetKey] = useState<string | null>(null);

  const configForCore = useMemo(() => buildInstallerConfig(form), [form]);
  const result = useMemo(() => validateInstallerConfig(configForCore), [configForCore]);
  const diagnostics = useMemo(
    () => (result.ok ? buildInstallerDiagnostics(result.config, result.archivePreviews) : null),
    [result],
  );
  const runtimeRequirementsText = useMemo(
    () =>
      result.ok ? renderRuntimeRequirementsText(resolveRuntimeDependencies(result.config)) : null,
    [result],
  );
  const installCommandExamples = useMemo(
    () => (result.ok ? buildInstallCommandExamples(result.config) : null),
    [result],
  );

  const tagCheckTarget = result.ok
    ? (result.config.targets.find((target) => targetKey(target) === tagCheckTargetKey) ??
      result.config.targets[0])
    : undefined;

  // Offline only: never fetches GitHub, and does not confirm the release exists.
  // Re-runs the same prefix/suffix algorithm the generated installer's checksum-index
  // scan uses (issue #111), against text or a filename the user pasted in themselves.
  const expectedTagCheck: ExpectedReleaseTagCheckResult | null = useMemo(() => {
    if (!result.ok || !tagCheckTarget || tagCheckText.trim().length === 0) {
      return null;
    }
    return checkExpectedReleaseTag({
      archiveNameTemplate: result.config.archive.nameTemplate,
      archiveFormat: result.config.archive.format,
      osCase: result.config.archive.osCase,
      owner: result.config.owner,
      repo: result.config.repo,
      bin: result.config.binary.name,
      target: tagCheckTarget,
      assetArchLabel: result.config.architectureLabels[tagCheckTarget.os][tagCheckTarget.arch],
      source:
        tagCheckMode === "checksum-index"
          ? { kind: "checksum-index", text: tagCheckText }
          : { kind: "archive-filename", fileName: tagCheckText },
    });
  }, [result, tagCheckTarget, tagCheckMode, tagCheckText]);

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

  const onCopyCurl = async () => {
    if (installCommandExamples === null) {
      return;
    }
    try {
      await navigator.clipboard.writeText(installCommandExamples.standardCurlCommand);
      setCurlCopyState("copied");
    } catch {
      setCurlCopyState("error");
    }
    window.setTimeout(() => setCurlCopyState("idle"), 2000);
  };

  const onCopyContract = async () => {
    try {
      await navigator.clipboard.writeText(INSTALLER_CONTRACT_MARKDOWN);
      setContractCopyState("copied");
    } catch {
      setContractCopyState("error");
    }
    window.setTimeout(() => setContractCopyState("idle"), 2000);
  };

  const statusOk = result.ok && generation.error === null;

  return (
    <main className="min-h-screen w-full bg-[#f4f6f1] text-[#171717]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-6 md:px-8">
        <header className="flex flex-col gap-2 border-b border-[#b8c0b0] pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold text-[#235b4d] md:text-4xl">installerer</h1>
              <span className="text-sm font-semibold text-[#6f786e]">v{packageJson.version}</span>
              <span className="font-mono text-xs text-[#6f786e]">{commitHash}</span>
              <a
                href="https://github.com/tooppoo/installerer"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View installerer on GitHub"
                className="shrink-0 p-1"
              >
                <img src="/assets/GitHub_Invertocat_Black.svg" alt="GitHub" className="h-7 w-7" />
              </a>
              <a
                href="https://www.apache.org/licenses/LICENSE-2.0"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Apache 2.0 License"
              >
                <img src="/assets/License-Apache_2.0-blue.svg" alt="License: Apache 2.0" />
              </a>
              <a
                href="/licenses.txt"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Third Party Licenses
              </a>
            </div>
            <p className="mt-1 text-sm font-semibold uppercase text-[#4a4037]">
              Installer Generator
            </p>
            <p className="mt-2 max-w-2xl text-sm text-[#4a4037]">
              Fill in the form to generate a POSIX <code>install.sh</code>. Copy the output and save
              it as <code>install.sh</code>. POSIX shell behavior, download, checksum verification,
              and latest-release tag resolution are the generated installer&apos;s responsibility —
              this page never calls GitHub or fetches any release asset.
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
                archive.format
                <select
                  className={fieldClassName}
                  value={form.archiveFormat}
                  onChange={(event) =>
                    update(
                      "archiveFormat",
                      event.target.value as InstallerFormState["archiveFormat"],
                    )
                  }
                >
                  {ARCHIVE_FORMAT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <span className="text-xs font-normal leading-snug text-[#6d625a]">
                  archive.nameTemplate must end with {ARCHIVE_FORMAT_SUFFIXES[form.archiveFormat]}.
                  The generated installer requires{" "}
                  <code>{ARCHIVE_FORMAT_RUNTIME_DEPENDENCIES[form.archiveFormat]}</code> at runtime.
                </span>
              </label>
              <label className={labelClassName}>
                archive.nameTemplate
                <input
                  className={fieldClassName}
                  value={form.archiveNameTemplate}
                  onChange={(event) => update("archiveNameTemplate", event.target.value)}
                  spellCheck={false}
                />
                <span className="text-xs font-normal leading-snug text-[#6d625a]">
                  {form.archiveNameTemplate.includes("{version}")
                    ? "Contains {version}: latest install resolves the release tag from a checksum-index scan (at most one {version})."
                    : "No {version}: latest install downloads directly from the latest release, with no resolved tag."}
                </span>
              </label>
              <label className={labelClassName}>
                archive.osCase
                <select
                  className={fieldClassName}
                  value={form.archiveOsCase}
                  onChange={(event) =>
                    update(
                      "archiveOsCase",
                      event.target.value as InstallerFormState["archiveOsCase"],
                    )
                  }
                >
                  {OS_CASE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <span className="text-xs font-normal leading-snug text-[#6d625a]">
                  How {"{os}"} and {"{target}"} render, e.g. {OS_CASE_EXAMPLES[form.archiveOsCase]}.
                </span>
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

            <fieldset className="flex flex-col gap-3 border border-[#aeb8a8] p-3">
              <legend className="px-1 text-sm font-semibold text-[#4a4037]">
                architectureLabels
              </legend>
              <label className="flex items-center gap-2 text-sm text-[#4a4037]">
                <input
                  type="checkbox"
                  checked={form.architectureLabelsPerOs}
                  onChange={(event) =>
                    setForm((current) => setArchitectureLabelsPerOs(current, event.target.checked))
                  }
                />
                Specify per OS
              </label>
              {form.architectureLabelsPerOs ? (
                TARGET_OPERATING_SYSTEMS.map((os) => (
                  <div key={os} className="flex flex-col gap-2 border-t border-[#dfe5dc] pt-2">
                    <span className="font-mono text-sm font-semibold text-[#4a4037]">{os}</span>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {CANONICAL_ARCHITECTURES.map((arch) => (
                        <ArchitectureLabelField
                          key={arch}
                          arch={arch}
                          value={form.architectureLabelsByOs[os][arch]}
                          onChange={(value) =>
                            update("architectureLabelsByOs", {
                              ...form.architectureLabelsByOs,
                              [os]: { ...form.architectureLabelsByOs[os], [arch]: value },
                            })
                          }
                        />
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {CANONICAL_ARCHITECTURES.map((arch) => (
                    <ArchitectureLabelField
                      key={arch}
                      arch={arch}
                      value={form.architectureLabels[arch]}
                      onChange={(value) =>
                        update("architectureLabels", {
                          ...form.architectureLabels,
                          [arch]: value,
                        })
                      }
                    />
                  ))}
                </div>
              )}
              <span className="text-xs font-normal leading-snug text-[#6d625a]">
                How {"{arch}"} and {"{target}"} render the detected architecture in Release asset
                names, either shared by every OS or per OS. This is independent of the runtime
                architecture detected by the generated installer.
              </span>
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

            {runtimeRequirementsText ? (
              <section className="border border-[#cdd6c6] bg-white">
                <div className="border-b border-[#cdd6c6] bg-[#f0f4ec] px-3 py-2">
                  <h2 className="text-sm font-semibold text-[#4a4037]">Runtime requirements</h2>
                  <p className="mt-1 text-xs leading-4 text-[#6d625a]">
                    Derived from the same dependency list the generated installer's{" "}
                    <code>--requirements</code> / <code>--check-requirements</code> use.
                  </p>
                </div>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words px-3 py-3 font-mono text-xs leading-5 text-[#235b4d]">
                  {runtimeRequirementsText}
                </pre>
              </section>
            ) : null}

            {diagnostics ? (
              <section className="border border-[#cdd6c6] bg-white">
                <div className="border-b border-[#cdd6c6] bg-[#f0f4ec] px-3 py-2">
                  <h2 className="text-sm font-semibold text-[#4a4037]">Helper diagnostics</h2>
                  <p className="mt-1 text-xs leading-4 text-[#6d625a]">
                    Non-authoritative preview. Does not guarantee repository, asset, checksum,
                    contract, or installer success.
                  </p>
                </div>

                <div className="divide-y divide-[#dfe5dc]">
                  <DiagnosticDetails
                    title="Typo check commands"
                    values={diagnostics.typoCommands}
                    defaultOpen
                  />
                  <DiagnosticDetails
                    title="Expected release assets"
                    values={diagnostics.expectedReleaseAssets}
                  />
                  <DiagnosticDetails title="Latest URL preview" values={diagnostics.urls.latest} />
                  <DiagnosticDetails title="Pinned URL preview" values={diagnostics.urls.pinned} />
                  <DiagnosticDetails
                    title="Latest install notes"
                    values={[
                      ...diagnostics.latestInstallNotes,
                      "Omitting --version installs latest; --version <version> installs a pinned tag.",
                      "--version latest is invalid, and JSON config has no defaults.version.",
                    ]}
                  />
                  <DiagnosticDetails
                    title="Install command examples"
                    values={diagnostics.installCommands.valid}
                  />
                  <DiagnosticDetails
                    title="Invalid command example"
                    values={diagnostics.installCommands.invalid}
                  />
                </div>
              </section>
            ) : null}

            {result.ok ? (
              <section className="border border-[#cdd6c6] bg-white">
                <div className="border-b border-[#cdd6c6] bg-[#f0f4ec] px-3 py-2">
                  <h2 className="text-sm font-semibold text-[#4a4037]">
                    Expected release tag check
                  </h2>
                  <p className="mt-1 text-xs leading-4 text-[#6d625a]">
                    Offline only: never fetches GitHub and does not confirm the release exists.
                    Paste a checksum file's text (as published) or a single archive filename you
                    observed, and this runs the same prefix/suffix scan the generated installer's
                    checksum-index latest install uses.
                  </p>
                </div>

                <div className="flex flex-col gap-3 p-3">
                  {result.config.targets.length > 1 ? (
                    <label className={labelClassName}>
                      target
                      <select
                        className={fieldClassName}
                        value={tagCheckTarget ? targetKey(tagCheckTarget) : ""}
                        onChange={(event) => setTagCheckTargetKey(event.target.value)}
                      >
                        {result.config.targets.map((target) => (
                          <option key={targetKey(target)} value={targetKey(target)}>
                            {targetKey(target)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  <div className="flex gap-4 text-sm text-[#4a4037]">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={tagCheckMode === "checksum-index"}
                        onChange={() => setTagCheckMode("checksum-index")}
                      />
                      Paste checksum file text
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={tagCheckMode === "archive-filename"}
                        onChange={() => setTagCheckMode("archive-filename")}
                      />
                      Paste a single archive filename
                    </label>
                  </div>

                  <label className={labelClassName}>
                    {tagCheckMode === "checksum-index" ? "checksum file text" : "archive filename"}
                    {tagCheckMode === "checksum-index" ? (
                      <textarea
                        className={`${fieldClassName} min-h-[100px] resize-y`}
                        value={tagCheckText}
                        onChange={(event) => setTagCheckText(event.target.value)}
                        spellCheck={false}
                        placeholder={"<sha256>  " + "rellog_v1.2.3_linux_x86_64.tar.gz"}
                      />
                    ) : (
                      <input
                        className={fieldClassName}
                        value={tagCheckText}
                        onChange={(event) => setTagCheckText(event.target.value)}
                        spellCheck={false}
                        placeholder="rellog_v1.2.3_linux_x86_64.tar.gz"
                      />
                    )}
                  </label>

                  {expectedTagCheck ? (
                    <ExpectedTagCheckResultView result={expectedTagCheck} />
                  ) : null}
                </div>
              </section>
            ) : null}

            {/* Bundled at build time from docs/guide/installer-contract.md — no runtime fetch. */}
            <details className="group border border-[#aeb8a8] bg-white">
              <summary className="flex cursor-pointer select-none items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-[#4a4037]">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="inline-block text-[#6d625a] transition-transform duration-150 group-open:rotate-90"
                  >
                    ▶
                  </span>
                  Installer contract (docs)
                  <span className="text-xs font-normal text-[#6d625a] group-open:hidden">
                    (click to expand)
                  </span>
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    void onCopyContract();
                  }}
                  className="border border-[#287047] bg-[#e2f2df] px-3 py-1 text-xs font-semibold text-[#174c2e] transition-colors hover:bg-[#d0ebca]"
                >
                  {contractCopyState === "copied"
                    ? "Copied!"
                    : contractCopyState === "error"
                      ? "Copy failed"
                      : "Copy"}
                </button>
              </summary>
              <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap border-t border-[#aeb8a8] bg-[#f7f6f2] p-4 font-mono text-xs leading-5 text-[#3b2f2a]">
                {INSTALLER_CONTRACT_SEGMENTS.map((segment, index) =>
                  segment.type === "link" ? (
                    <a
                      key={`installer-contract-link-${index}`}
                      href={segment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#174c2e] underline hover:text-[#0f3620]"
                    >
                      {segment.label}
                    </a>
                  ) : (
                    segment.value
                  ),
                )}
              </pre>
            </details>
          </div>
        </section>

        {statusOk && installCommandExamples !== null ? (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#4a4037]">Standard curl install</h2>
              <button
                type="button"
                onClick={onCopyCurl}
                className="border border-[#287047] bg-[#e2f2df] px-4 py-1.5 text-sm font-semibold text-[#174c2e] transition-colors hover:bg-[#d0ebca]"
              >
                {curlCopyState === "copied"
                  ? "Copied!"
                  : curlCopyState === "error"
                    ? "Copy failed"
                    : "Copy"}
              </button>
            </div>
            <pre className="overflow-auto whitespace-pre-wrap break-words border border-[#4d5c57] bg-[#111816] p-4 font-mono text-xs leading-5 text-[#e9f0ea]">
              {installCommandExamples.standardCurlCommand}
            </pre>
            <p className="text-xs leading-4 text-[#6d625a]">
              {installCommandExamples.standardCurlAssumption}
            </p>

            <div className="flex flex-col gap-1">
              <h3 className="text-xs font-semibold uppercase text-[#4a4037]">
                Review-first alternative
              </h3>
              <pre className="overflow-auto whitespace-pre-wrap break-words border border-[#aeb8a8] bg-white p-3 font-mono text-xs leading-5 text-[#3b2f2a]">
                {installCommandExamples.reviewFirstCommands.join("\n")}
              </pre>
            </div>
          </section>
        ) : null}

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

function ArchitectureLabelField({
  arch,
  value,
  onChange,
}: {
  arch: TargetArch;
  value: string;
  onChange: (value: string) => void;
}) {
  const selection = architectureLabelSelection(arch, value);
  return (
    <div className="flex flex-col gap-1">
      <label className={labelClassName}>
        {arch}
        <select
          className={fieldClassName}
          value={selection}
          onChange={(event) => {
            const next = event.target.value;
            onChange(next === CUSTOM_ARCHITECTURE_LABEL ? "" : next);
          }}
        >
          {ARCHITECTURE_LABEL_PRESETS[arch].map((preset) => (
            <option key={preset} value={preset}>
              {preset}
            </option>
          ))}
          <option value={CUSTOM_ARCHITECTURE_LABEL}>custom</option>
        </select>
      </label>
      {selection === CUSTOM_ARCHITECTURE_LABEL ? (
        <input
          className={fieldClassName}
          value={value}
          placeholder="custom asset label"
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
        />
      ) : null}
    </div>
  );
}

function DiagnosticDetails({
  title,
  values,
  defaultOpen = false,
}: {
  title: string;
  values: string[];
  defaultOpen?: boolean;
}) {
  return (
    <details className="group" open={defaultOpen}>
      <summary className="flex cursor-pointer select-none items-center justify-between gap-3 px-3 py-2 text-xs font-semibold uppercase text-[#4a4037]">
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block shrink-0 text-[#6d625a] transition-transform duration-150 group-open:rotate-90"
          >
            ▶
          </span>
          <span className="truncate">{title}</span>
        </span>
        <span className="shrink-0 font-mono text-[11px] text-[#6d625a]">{values.length}</span>
      </summary>
      <ul className="max-h-44 overflow-auto px-3 pb-3">
        {values.map((value) => (
          <li key={value} className="mt-1.5">
            <code className="block break-all bg-[#f7f6f2] px-2 py-1.5 font-mono text-xs leading-5 text-[#235b4d]">
              {value}
            </code>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Human-readable message for each `checkExpectedReleaseTag` failure reason. */
function expectedTagCheckFailureMessage(
  result: Extract<ExpectedReleaseTagCheckResult, { ok: false }>,
): string {
  switch (result.reason) {
    case "malformed-template":
      return "archive.nameTemplate is malformed; fix it above before checking a tag.";
    case "template-has-no-version":
      return "This archive.nameTemplate has no {version}. Latest install always fetches directly from the latest release; there is no tag to resolve or check.";
    case "no-match":
      return `No match: expected a filename starting with "${result.prefix}" and ending with "${result.suffix}".`;
    case "ambiguous":
      return `Ambiguous: ${result.candidates.length} distinct filenames match "${result.prefix}"…"${result.suffix}": ${result.candidates.join(", ")}.`;
    case "invalid-git-tag":
      return `"${result.candidate}" is not a valid Git tag.`;
    case "unsafe-filename-tag":
      return `"${result.candidate}" is not supported: tags used for {version} extraction must not contain '/', '\\', whitespace, or control characters.`;
  }
}

function ExpectedTagCheckResultView({ result }: { result: ExpectedReleaseTagCheckResult }) {
  if (!result.ok && result.reason === "template-has-no-version") {
    return (
      <div className="border border-[#aeb8a8] bg-[#f7f6f2] p-3 text-sm text-[#4a4037]">
        {expectedTagCheckFailureMessage(result)}
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div className="border border-[#d1887f] bg-[#fff4f1] p-3 text-sm text-[#3b2f2a]">
        {expectedTagCheckFailureMessage(result)}
      </div>
    );
  }

  return (
    <div className="border border-[#78a86c] bg-[#edf8e9] p-3 text-sm text-[#174c2e]">
      <div>
        expected release tag: <code className="font-mono font-semibold">{result.expectedTag}</code>
      </div>
      <div className="mt-1 text-xs text-[#174c2e]">
        matched archive asset: <code className="font-mono">{result.archiveAssetName}</code>
      </div>
      <div className="mt-2 text-xs text-[#4a4037]">
        This is an offline computation only — it does not confirm that this release or asset
        actually exists on GitHub.
      </div>
    </div>
  );
}
