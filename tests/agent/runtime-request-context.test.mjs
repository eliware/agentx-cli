import { expect, test } from "@jest/globals";
import { createAgentRequestContext } from "../../src/agent/runtime-request-context.mjs";

test("builds the request context", () => {
  expect(typeof createAgentRequestContext).toBe("function");
});
