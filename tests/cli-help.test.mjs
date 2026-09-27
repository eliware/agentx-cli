import { describe, expect, test } from "@jest/globals";
import { formatQuickHelp } from "../src/cli-help.mjs";

describe("CLI help rendering", () => {
  test("uses package metadata by default", () => {
    expect(formatQuickHelp()).toMatch(/^AgentX \d+\.\d+\.\d+/);
  });

  test("renders core commands and flags with an explicit version", () => {
    const help = formatQuickHelp("9.9.9");
    expect(help).toContain("AgentX 9.9.9");
    expect(help).toContain("--help, -h, -?");
    expect(help).toContain("--version, -v");
    expect(help).toContain("--debug");
    expect(help).toContain("--yolo");
    expect(help).toContain("--cwd PATH, -C PATH");
    expect(help).toContain("--check-mcp, -K");
    expect(help).toContain("--no-mcp-output, -M");
  });
});
