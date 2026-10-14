import { describe, expect, test } from "@jest/globals";
import { longFlags, shortOutputFlags } from "../src/cli-flag-maps.mjs";

describe("CLI flag maps", () => {
  test("maps short and long output flags", () => {
    expect(shortOutputFlags.q).toBe("quiet");
    expect(shortOutputFlags.M).toBe("noMcpOutput");
    expect(longFlags["--check-mcp"]).toBe("checkMcp");
    expect(longFlags["--confirm"]).toBe("confirm");
  });
});
