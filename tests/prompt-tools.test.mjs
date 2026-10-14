import { describe, expect, test } from "@jest/globals";
import { filterWorkerTools } from "../src/prompt-tools.mjs";

describe("prompt worker tools", () => {
  test("removes orchestration tools for workers and preserves other fields", () => {
    const template = {
      input: [],
      tools: [
        { name: "spawn_agent" },
        { name: "agent_status" },
        { name: "cancel_agent" },
        { name: "view_image" },
      ],
    };
    expect(filterWorkerTools(template, { AGENTX_WORKER_ID: "worker" })).toEqual({
      input: [],
      tools: [{ name: "view_image" }],
    });
  });

  test("returns the original template for normal sessions", () => {
    const template = { tools: [{ name: "spawn_agent" }] };
    expect(filterWorkerTools(template, {})).toBe(template);
    expect(filterWorkerTools(template, null)).toBe(template);
  });

  test("uses an empty tool list when a worker template omits tools", () => {
    expect(filterWorkerTools({}, { AGENTX_WORKER_ID: "worker" })).toEqual({ tools: [] });
  });
});
