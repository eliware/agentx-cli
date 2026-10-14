import { expect, test } from "@jest/globals";
import { buildTurnUsageReport } from "../src/usage-turn-report-policy.mjs";

test("builds a per-turn report with a total", () => {
  expect(buildTurnUsageReport()).toMatchObject({ total: "$0.000" });
});
