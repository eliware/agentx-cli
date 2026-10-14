import { expect, test } from "@jest/globals";
import { aggregateWorkerOutput } from "../src/worker-log-aggregation.mjs";

test("counts output lines and retains parsed usage", () => {
  const worker = { output: "", lines: 0, usage: { turns: 0 } };
  aggregateWorkerOutput(worker, '{"in":"5","cache":"2","out":"3"}\nnext\n');
  expect(worker.lines).toBe(2);
  expect(worker.usage).toMatchObject({ inputTokens: 5, cachedTokens: 2, outputTokens: 3 });
  aggregateWorkerOutput(worker, "plain output\n");
  expect(worker.lines).toBe(3);
  expect(worker.usage).toMatchObject({ inputTokens: 5, outputTokens: 3 });
});

test("keeps prior usage when new output has no usage record", () => {
  const usage = { turns: 1 };
  const worker = { output: "", lines: 0, usage };
  aggregateWorkerOutput(worker, "plain output\n");
  expect(worker.usage).toBe(usage);
  expect(worker.lines).toBe(1);
});
