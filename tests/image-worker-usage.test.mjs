import { expect, test } from "@jest/globals";
import { createImageWorkerUsage } from "../src/image-worker-usage.mjs";

test("adds image usage and defaults missing fields", () => {
  const totals = createImageWorkerUsage();
  totals.add({ turns: 2, inputTokens: 3, cachedTokens: 1, outputTokens: 4 });
  totals.add(undefined);
  expect(totals.usage).toEqual({ turns: 3, inputTokens: 3, cachedTokens: 1, outputTokens: 4 });
});
