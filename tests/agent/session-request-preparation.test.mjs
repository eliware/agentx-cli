import { expect, test } from "@jest/globals";
import { prepareSessionRequest } from "../../src/agent/session-request-preparation.mjs";

function makeContext(overrides = {}) {
  return {
    oneShot: true,
    agentsText: "worker instructions",
    getTemplate: () => ({
      tools: [
        { type: "function", name: "existing" },
        { type: "function", name: "goal_update" },
        { type: "function", name: "goal_blocked" },
      ],
    }),
    getGoal: () => ({ status: "active" }),
    getCwd: () => "/repo",
    ...overrides,
  };
}

test("prepares goal tools and worker guidance for a one-shot worker", () => {
  const previousId = process.env.AGENTX_WORKER_ID;
  process.env.AGENTX_WORKER_ID = "worker-1";
  try {
    const { requestTemplate, activeOverride } = prepareSessionRequest({
      context: makeContext(),
      state: { previousResponseId: "parent" },
      requestMessage: "inspect this task",
    });
    expect(requestTemplate.tools.map(({ name }) => name)).toEqual(
      expect.arrayContaining(["existing", "goal_update", "goal_blocked"]),
    );
    expect(activeOverride).toMatchObject({
      previous_response_id: "parent",
      input: [
        {
          role: "developer",
          content: [{ type: "input_text", text: expect.stringContaining("delegated worker") }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: "inspect this task" }],
        },
      ],
    });
  } finally {
    if (previousId === undefined) delete process.env.AGENTX_WORKER_ID;
    else process.env.AGENTX_WORKER_ID = previousId;
  }
});

test("omits worker guidance outside a worker process", () => {
  const previousId = process.env.AGENTX_WORKER_ID;
  delete process.env.AGENTX_WORKER_ID;
  try {
    const { activeOverride } = prepareSessionRequest({
      context: makeContext(),
      state: { previousResponseId: "parent" },
      requestMessage: "ordinary task",
    });
    expect(activeOverride.input[0].role).toBe("user");
  } finally {
    if (previousId !== undefined) process.env.AGENTX_WORKER_ID = previousId;
  }
});
