import { describe, expect, test } from "@jest/globals";
import { parseCliArgs } from "../src/cli-args.mjs";

describe("CLI argument parsing", () => {
  test("parses long and stacked output flags separately from message text", () => {
    const parsed = parseCliArgs(["-qur", "--no-colors", "review", "this"]);
    expect(parsed.messageArgs).toEqual(["review", "this"]);
    expect(parsed.flags).toMatchObject({
      quiet: true,
      noUsage: true,
      noReasoning: true,
      noColors: true,
    });
  });

  test("parses cwd and MCP options", () => {
    expect(parseCliArgs(["--cwd", "project", "review"]).flags.cwd).toBe("project");
    expect(parseCliArgs(["--cwd=project"]).flags.cwd).toBe("project");
    expect(parseCliArgs(["--cwd=--help"]).flags.cwd).toBe("");
    expect(parseCliArgs(["--cwd="]).flags.cwd).toBe("");
    expect(parseCliArgs(["-C", "project", "review"]).messageArgs).toEqual(["review"]);
    expect(parseCliArgs(["--cwd"]).flags.cwd).toBe("");
    expect(parseCliArgs(["--check-mcp", "-K"]).flags.checkMcp).toBe(true);
    expect(parseCliArgs(["--no-mcp", "--no-mcp-output", "-M"]).flags).toMatchObject({
      noMcp: true,
      noMcpOutput: true,
    });
  });

  test("supports option passthrough, help/version aliases, and unknown task text", () => {
    expect(parseCliArgs(["--", "--no-usage", "message"]).messageArgs).toEqual([
      "--no-usage",
      "message",
    ]);
    expect(parseCliArgs(["--unknown"]).messageArgs).toEqual(["--unknown"]);
    expect(parseCliArgs(["-h", "-v"]).flags).toMatchObject({ help: true, version: true });
    expect(parseCliArgs().messageArgs).toEqual([]);
  });
});
