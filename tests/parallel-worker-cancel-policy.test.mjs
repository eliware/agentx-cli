import { expect, test } from "@jest/globals";
import { selectWorkerCancelAction } from "../src/parallel-worker-cancel-policy.mjs";

test.each(["running", "timed_out"])("selects live cancellation for %s workers", (status) => {
  expect(selectWorkerCancelAction({ status, pid: 10 }, {})).toBe("live");
});

test.each(["running", "timed_out"])("selects recovered cancellation for %s workers", (status) => {
  expect(selectWorkerCancelAction({ status, pid: 10 }, null)).toBe("recovered");
});

test.each([
  [null, null],
  [{ status: "completed", pid: 10 }, null],
  [{ status: "running" }, null],
])("skips non-cancellable targets", (worker, child) => {
  expect(selectWorkerCancelAction(worker, child)).toBe("none");
});
