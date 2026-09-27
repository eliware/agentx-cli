import { describe, expect, test } from "@jest/globals";
import { formatMcpConfigValidation } from "../src/mcp-config-format.mjs";

describe("MCP config result formatting", () => {
  test("formats missing and invalid results", () => {
    expect(formatMcpConfigValidation({ exists: false, filePath: "missing.json" })).toBe(
      "MCP config not found: missing.json",
    );
    expect(
      formatMcpConfigValidation({
        exists: true,
        valid: false,
        filePath: "bad.json",
        errors: ["bad shape"],
      }),
    ).toBe("MCP config invalid: bad.json\n- bad shape");
  });

  test("formats empty and populated valid results without exposing credentials", () => {
    expect(
      formatMcpConfigValidation({ exists: true, valid: true, filePath: "mcp.json", tools: [] }),
    ).toBe("MCP config valid: no MCP tools configured (mcp.json)");
    expect(
      formatMcpConfigValidation({
        exists: true,
        valid: true,
        tools: [
          { server_label: "api", server_url: "https://api.example/mcp", authorization: "hidden" },
          { server_label: "db", server_url: "https://db.example/mcp" },
        ],
      }),
    ).toBe(
      "MCP config valid: 2 MCP tools configured\n- api: https://api.example/mcp (authorization present)\n- db: https://db.example/mcp (authorization present)",
    );
    expect(
      formatMcpConfigValidation({
        exists: true,
        valid: true,
        tools: [{ server_label: "api", server_url: "https://api.example/mcp" }],
      }),
    ).toContain("1 MCP tool configured");
  });
});
