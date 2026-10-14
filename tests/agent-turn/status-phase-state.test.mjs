import { expect, test } from "@jest/globals";
import { createStatusPhaseState } from "../../src/agent-turn/status-phase-state.mjs";

test("tracks phase duration and cumulative time", () => {
  const state = createStatusPhaseState(0);
  state.setState("reasoning", 10_000);
  state.setState("executing", 30_000);
  expect(state.snapshot(50_000).reasoning.value).toBe("20s/20s");
  expect(state.snapshot(50).executing.active).toBe(true);
  state.reset();
  expect(state.state).toBeNull();
});
