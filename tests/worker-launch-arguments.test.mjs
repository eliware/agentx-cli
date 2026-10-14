import { expect, test } from "@jest/globals";
import { workerLaunchArgs } from "../src/worker-launch-arguments.mjs";

test("builds default and debug worker commands", () => {
  expect(workerLaunchArgs("agent.mjs", "task")).toEqual(["agent.mjs", "--", "task"]);
  expect(workerLaunchArgs("agent.mjs", "task", true)).toEqual([
    "agent.mjs",
    "--debug",
    "--",
    "task",
  ]);
});
