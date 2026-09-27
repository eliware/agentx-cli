import { describe, expect, test } from "@jest/globals";
import {
  buildRequestOverride,
  GOAL_TOOL_NAMES,
  withGoalTools,
  WORKER_ROLE_MESSAGE,
} from "../src/request-builder.mjs";

describe("request builder", () => {
  test("selects goal tools without mutating the prompt template", () => {
    const template = {
      tools: [{ name: "goal_update" }, { name: "lookup" }, {}],
      tool_choice: "auto",
    };
    expect(withGoalTools(template, true)).toEqual({
      tools: [{ name: "lookup" }, {}, { name: "goal_update" }],
      tool_choice: "required",
    });
    expect(withGoalTools(template, false)).toEqual({
      tools: [{ name: "lookup" }, {}],
      tool_choice: "auto",
    });
    expect(template.tools[0].name).toBe("goal_update");
    expect(withGoalTools(undefined, false)).toEqual({ tools: [] });
    expect(withGoalTools(undefined, true)).toEqual({ tools: [], tool_choice: "required" });
    expect(GOAL_TOOL_NAMES.has("goal_blocked")).toBe(true);
  });

  test("builds first-turn and continuation requests", () => {
    const template = {
      input: [
        { role: "developer", content: [{ type: "input_text", text: "base prompt" }] },
        { role: "user", content: [{ type: "input_text", text: "first user message" }] },
      ],
    };
    expect(buildRequestOverride(template, "hello", "AGENTS body", "/tmp/work", "")).toMatchObject({
      store: true,
      input: [
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: expect.stringContaining("Identity guidance: You are AgentX"),
            },
          ],
        },
        { role: "user", content: [{ type: "input_text", text: "hello" }] },
      ],
    });
    expect(
      buildRequestOverride(template, "next", "AGENTS body", "/tmp/work", "resp-1"),
    ).toMatchObject({
      store: true,
      previous_response_id: "resp-1",
      input: [{ role: "user", content: [{ type: "input_text", text: "next" }] }],
    });
    expect(
      buildRequestOverride(template, "worker task", "", "/tmp/work", "resp-1", WORKER_ROLE_MESSAGE),
    ).toMatchObject({
      previous_response_id: "resp-1",
      input: [
        {
          role: "developer",
          content: [{ type: "input_text", text: expect.stringContaining("delegated worker") }],
        },
        { role: "user", content: [{ type: "input_text", text: "worker task" }] },
      ],
    });
  });

  test("preserves non-text parts and safely replaces absent prompt text", () => {
    const template = {
      input: [
        { role: "developer", content: [{ type: "output_text", text: "base prompt" }] },
        { role: "user", content: [{ type: "output_text", text: "existing user text" }] },
      ],
    };
    expect(buildRequestOverride(template, "hello", "", "/tmp/work", "")).toMatchObject({
      store: true,
      input: template.input,
    });
    expect(
      buildRequestOverride(
        {
          input: [
            { role: "developer", content: [{ type: "input_text" }] },
            { role: "user", content: [{ type: "input_text" }] },
          ],
        },
        "hello",
        "",
        "/tmp/work",
        "",
      ),
    ).toMatchObject({
      store: true,
      input: [
        { role: "developer", content: [{ type: "input_text", text: expect.any(String) }] },
        { role: "user", content: [{ type: "input_text", text: "hello" }] },
      ],
    });
  });
});
