import { expect, jest, test } from "@jest/globals";
import { readFile } from "node:fs/promises";

await import("../test-fixtures/entrypoint-startup-suite.mjs");
await import("../test-fixtures/entrypoint-info-suite.mjs");
await import("../test-fixtures/entrypoint-mcp-suite.mjs");
await import("../test-fixtures/entrypoint-cwd-suite.mjs");
await import("../test-fixtures/entrypoint-errors-suite.mjs");
await import("../test-fixtures/entrypoint-setup-integration-suite.mjs");
await import("../test-fixtures/entrypoint-direct-suite.mjs");

test("the source entrypoint supports the documented CLI flags", async () => {
  await jest.unstable_mockModule("../src/runtime.mjs", () => ({
    isDirectInvocation: () => false,
    promptPath: "",
    deleteOptional: async () => {},
    readOptionalText: async () => null,
  }));
  await jest.unstable_mockModule("../src/agent/runtime.mjs", () => ({ runAgent: async () => {} }));
  const entrypoint = await import("../src/agent-entrypoint.mjs");
  const source = await readFile(new URL("../src/agent-entrypoint.mjs", import.meta.url), "utf8");
  expect(entrypoint).toBeDefined();
  expect(source).toContain("parseCliArgs(argv)");
  expect(source).toContain("parsed.flags.help");
  expect(source).toContain("parsed.flags.version");
});

await import("../test-fixtures/agentx-smoke-suite.mjs");
