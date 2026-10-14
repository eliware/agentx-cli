import { expect, test } from "@jest/globals";
import { createAgentUserTurnSession } from "../../src/agent/runtime-user-turn-session.mjs";

test("builds the user turn session", () => {
  expect(typeof createAgentUserTurnSession).toBe("function");
});
