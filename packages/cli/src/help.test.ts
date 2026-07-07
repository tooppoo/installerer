import { describe, expect, test } from "bun:test";

import { renderHelpText } from "./help";

describe("renderHelpText", () => {
  test("always renders the abstraction and usage sections", () => {
    const text = renderHelpText({
      abstraction: "example CLI",
      usage: ["example <command>"],
    });

    expect(text).toBe(["example CLI", "", "Usage:", "  example <command>", ""].join("\n"));
  });

  test("omits the commands section when commands is not given", () => {
    const text = renderHelpText({
      abstraction: "example CLI",
      usage: ["example <command>"],
    });

    expect(text).not.toContain("Commands:");
  });

  test("omits the options section when options is not given", () => {
    const text = renderHelpText({
      abstraction: "example CLI",
      usage: ["example <command>"],
    });

    expect(text).not.toContain("Options:");
  });

  test("renders the commands section when commands is given", () => {
    const text = renderHelpText({
      abstraction: "example CLI",
      usage: ["example <command>"],
      commands: ["example init"],
    });

    expect(text).toContain(["Commands:", "  example init"].join("\n"));
  });

  test("renders the options section when options is given", () => {
    const text = renderHelpText({
      abstraction: "example CLI",
      usage: ["example <command>"],
      options: ["-h, --help"],
    });

    expect(text).toContain(["Options:", "  -h, --help"].join("\n"));
  });

  test("omits the examples section when examples is not given", () => {
    const text = renderHelpText({
      abstraction: "example CLI",
      usage: ["example <command>"],
    });

    expect(text).not.toContain("Examples:");
  });

  test("renders the examples section when examples is given", () => {
    const text = renderHelpText({
      abstraction: "example CLI",
      usage: ["example <command>"],
      examples: ["example init --name demo"],
    });

    expect(text).toContain(["Examples:", "  example init --name demo"].join("\n"));
  });

  test("renders sections in the order abstraction, usage, commands, options, examples", () => {
    const text = renderHelpText({
      abstraction: "example CLI",
      usage: ["example <command>"],
      commands: ["example init"],
      options: ["-h, --help"],
      examples: ["example init --name demo"],
    });

    const abstractionIndex = text.indexOf("example CLI");
    const usageIndex = text.indexOf("Usage:");
    const commandsIndex = text.indexOf("Commands:");
    const optionsIndex = text.indexOf("Options:");
    const examplesIndex = text.indexOf("Examples:");

    expect(abstractionIndex).toBeLessThan(usageIndex);
    expect(usageIndex).toBeLessThan(commandsIndex);
    expect(commandsIndex).toBeLessThan(optionsIndex);
    expect(optionsIndex).toBeLessThan(examplesIndex);
  });

  test("ends with exactly one trailing newline", () => {
    const text = renderHelpText({
      abstraction: "example CLI",
      usage: ["example <command>"],
      commands: ["example init"],
      options: ["-h, --help"],
    });

    expect(text.endsWith("\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
  });
});
