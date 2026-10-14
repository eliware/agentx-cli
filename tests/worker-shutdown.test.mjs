process.env.AGENTX_WORKER_SPAWN_CASES = "4,5,6";
await jest.isolateModulesAsync(() => import("../test-fixtures/parallel-workers-spawn-suite.mjs"));
import { expect, jest, test } from "@jest/globals";
import { terminateWorkerChildren } from "../src/worker-shutdown.mjs";

test("terminates active children with escalation", async () => {
  const child = { kill: jest.fn(), killed: false };
  const worker = { id: "a1", status: "running" };
  const persistWorker = jest.fn().mockResolvedValue(undefined);
  await terminateWorkerChildren({
    state: { children: new Map([["a1", child]]), workers: new Map([["a1", worker]]) },
    persistWorker,
    graceMs: 1,
  });
  expect(child.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
  expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
  expect(worker.status).toBe("cancelled");
});
