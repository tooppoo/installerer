import { parseKdlText, validateInstallerConfigKdl } from "@installerer/core";
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CliExitCode } from "../exitCodes";
import { CONFIG_FILE_NAME, INIT_CONFIG_TEMPLATE, initCommand } from "./init";

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "installerer-init-test-"));
  try {
    return fn(dir);
  } finally {
    chmodSync(dir, 0o700);
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("INIT_CONFIG_TEMPLATE", () => {
  test("matches the committed snapshot (pins node order, property order, indentation, trailing newline)", () => {
    expect(INIT_CONFIG_TEMPLATE).toMatchSnapshot();
  });

  test("ends with exactly one trailing newline", () => {
    expect(INIT_CONFIG_TEMPLATE.endsWith("\n")).toBe(true);
    expect(INIT_CONFIG_TEMPLATE.endsWith("\n\n")).toBe(false);
  });

  test("passes KDL syntax parse, codec, and semantic validation", () => {
    const parsed = parseKdlText(INIT_CONFIG_TEMPLATE);
    if (!parsed.ok) {
      throw new Error(`expected template to parse: ${JSON.stringify(parsed.errors)}`);
    }

    const validated = validateInstallerConfigKdl(parsed.document);
    if (!validated.ok) {
      throw new Error(`expected template to validate: ${JSON.stringify(validated.diagnostics)}`);
    }

    expect(validated.ok).toBe(true);
  });
});

describe("initCommand.run", () => {
  test("creates installerer.kdl, prints its name to stdout, and exits 0 when no config file exists yet", () => {
    withTempDir((dir) => {
      const result = initCommand.run([], dir);

      expect(result).toEqual({
        stdout: `created ${CONFIG_FILE_NAME}\n`,
        stderr: "",
        exitCode: CliExitCode.success,
      });
      expect(readFileSync(join(dir, CONFIG_FILE_NAME), "utf8")).toBe(INIT_CONFIG_TEMPLATE);
    });
  });

  test("does not overwrite an existing installerer.kdl, and reports the cause plus next steps on stderr", () => {
    withTempDir((dir) => {
      const configPath = join(dir, CONFIG_FILE_NAME);
      writeFileSync(configPath, "existing content");

      const result = initCommand.run([], dir);

      expect(result.stdout).toBe("");
      expect(result.exitCode).toBe(CliExitCode.configFileAlreadyExists);
      expect(result.stderr).toMatchSnapshot();
      expect(readFileSync(configPath, "utf8")).toBe("existing content");
    });
  });

  // Relies on the OS enforcing directory permissions against the
  // test-runner's own UID; a root process bypasses permission bits entirely,
  // so this would spuriously fail (write would succeed) under a root-by-
  // default container.
  test.skipIf(process.getuid?.() === 0)(
    "reports a write failure on stderr with the system error message and exits with the write-failed code",
    () => {
      withTempDir((dir) => {
        chmodSync(dir, 0o500);

        const result = initCommand.run([], dir);

        expect(result.stdout).toBe("");
        expect(result.exitCode).toBe(CliExitCode.configFileWriteFailed);

        const normalized = result.stderr.split(dir).join("<dir>");
        expect(normalized).toMatchSnapshot();
      });
    },
  );
});
