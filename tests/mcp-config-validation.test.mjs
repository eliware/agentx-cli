import { describe, expect, test } from "@jest/globals";
import { validateMcpConfig } from "../src/mcp-config-validation.mjs";

const validTool = (label = "developer") => ({
  type: "mcp",
  server_label: label,
  server_url: `https://${label}.example/mcp`,
  headers: { Authorization: "Bearer hidden" },
});

describe("MCP config validation", () => {
  test("accepts supported roots and authentication forms", () => {
    expect(validateMcpConfig([validTool()]).valid).toBe(true);
    expect(validateMcpConfig({ tools: [validTool()] }).valid).toBe(true);
    expect(
      validateMcpConfig([
        { ...validTool("oauth"), headers: {}, oauth: { client_id: "id", client_secret: "secret" } },
        { ...validTool("api-key"), headers: {}, api_key: "secret" },
        { ...validTool("alias"), headers: {}, apiKey: "secret" },
        { ...validTool("authorization"), headers: {}, authorization: "token" },
      ]).valid,
    ).toBe(true);
  });

  test("rejects malformed roots, duplicate labels, invalid URLs, and missing auth", () => {
    expect(validateMcpConfig({}).errors).toEqual([
      "config must be an array or an object with a tools array",
    ]);
    const result = validateMcpConfig([
      validTool(),
      { type: "mcp", server_label: "developer", server_url: "http://bad/mcp" },
      { type: "mcp", server_url: "not-a-url" },
      { type: "mcp", server_label: "empty", server_url: "" },
      { type: "function", name: "local" },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'MCP tool 2: duplicate server_label "developer"',
        "MCP tool 2 (developer): server_url must be a valid HTTPS URL",
        "MCP tool 2 (developer): authorization is required",
        "MCP tool 3: server_label is required",
        "MCP tool 3 (unnamed): server_url must be a valid HTTPS URL",
        "MCP tool 3 (unnamed): authorization is required",
      ]),
    );
  });
});
