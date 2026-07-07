/**
 * Minimal help frame shared by the top-level CLI help and future subcommand
 * help. It intentionally does not model a command parser or option schema;
 * it only carries the sections needed to render help text consistently.
 */
export type CliHelpFrame = {
  abstraction: string;
  usage: string[];
  commands?: string[];
  options?: string[];
  examples?: string[];
};

export function renderHelpText(frame: CliHelpFrame): string {
  const sections: string[][] = [[frame.abstraction], ["Usage:", ...indent(frame.usage)]];

  if (frame.commands && frame.commands.length > 0) {
    sections.push(["Commands:", ...indent(frame.commands)]);
  }

  if (frame.options && frame.options.length > 0) {
    sections.push(["Options:", ...indent(frame.options)]);
  }

  if (frame.examples && frame.examples.length > 0) {
    sections.push(["Examples:", ...indent(frame.examples)]);
  }

  return `${sections.map((section) => section.join("\n")).join("\n\n")}\n`;
}

function indent(lines: string[]): string[] {
  return lines.map((line) => `  ${line}`);
}
