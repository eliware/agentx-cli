import { describe, expect, test } from "@jest/globals";
import { normalizeOutputFlags } from "../src/cli-flags.mjs";

describe("CLI output flag normalization", () => {
  test("normalizes quiet output suppression while retaining reasoning and colors", () => {
    expect(normalizeOutputFlags({ quiet: true })).toMatchObject({
      quiet: true,
      noUsage: true,
      noTimers: true,
      noShellCalls: true,
      noToolCalls: true,
      noMcp: false,
      noMcpOutput: true,
      noWebsearch: true,
      noReasoning: false,
      noColors: false,
    });
  });

  test("keeps MCP loading and MCP output suppression independent", () => {
    expect(normalizeOutputFlags()).toMatchObject({ quiet: false, noUsage: false });
    expect(normalizeOutputFlags({ noMcp: true })).toMatchObject({
      noMcp: true,
      noMcpOutput: false,
    });
    expect(normalizeOutputFlags({ noMcpOutput: true })).toMatchObject({
      noMcp: false,
      noMcpOutput: true,
    });
  });
});
