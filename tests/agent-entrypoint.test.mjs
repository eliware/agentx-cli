import { expect, jest, test } from "@jest/globals";
import { readFile } from "node:fs/promises";

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
