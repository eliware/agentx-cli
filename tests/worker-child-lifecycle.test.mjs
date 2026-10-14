process.env.AGENTX_WORKER_SPAWN_CASES = "7";
await jest.isolateModulesAsync(() => import("../test-fixtures/parallel-workers-spawn-suite.mjs"));
import { EventEmitter } from "node:events";
import { expect, jest, test } from "@jest/globals";
import { attachWorkerLifecycle } from "../src/worker-child-lifecycle.mjs";

test("finalizes a child on close", async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn();
  const worker = { id: "agent-1", cwd: "/repo", status: "running", output: "", lines: 0 };
  const persistWorker = jest.fn().mockResolvedValue(undefined);
  const onComplete = jest.fn();
  attachWorkerLifecycle({
    child,
    worker,
    state: { children: new Map([[worker.id, child]]) },
    persistWorker,
    onComplete,
    timeoutMs: 100000,
    shutdownGraceMs: 10,
  });
  child.emit("close", 0, null);
  expect(worker.status).toBe("completed");
  expect(onComplete).toHaveBeenCalledWith(worker);
});
