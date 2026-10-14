process.env.AGENTX_WORKER_SPAWN_CASES = "8";
import { jest } from "@jest/globals";
await jest.isolateModulesAsync(() => import("../test-fixtures/parallel-workers-spawn-suite.mjs"));
import { describe, expect, test } from "@jest/globals";
import { workerLaunchArgs } from "../src/worker-process.mjs";

describe("worker process launch", () => {
  test("places task text after the CLI option boundary and forwards debug", () => {
    expect(workerLaunchArgs("/agentx.mjs", "task")).toEqual(["/agentx.mjs", "--", "task"]);
    expect(workerLaunchArgs("/agentx.mjs", "--quiet", true)).toEqual([
      "/agentx.mjs",
      "--debug",
      "--",
      "--quiet",
    ]);
  });
});
