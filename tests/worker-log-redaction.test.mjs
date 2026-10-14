import { expect, test } from "@jest/globals";
import { redactWorkerLog } from "../src/worker-log-redaction.mjs";

test("redacts both supported API key variables", () => {
  const previousUpper = process.env.AGENTX_API_KEY;
  const previousLower = process.env.agentx_api_key;
  process.env.AGENTX_API_KEY = "upper-secret";
  try {
    expect(redactWorkerLog("upper-secret")).not.toContain("upper-secret");
    process.env.agentx_api_key = "lower-secret";
    expect(redactWorkerLog("lower-secret")).not.toContain("lower-secret");
  } finally {
    if (previousUpper === undefined) delete process.env.AGENTX_API_KEY;
    else process.env.AGENTX_API_KEY = previousUpper;
    if (previousLower === undefined) delete process.env.agentx_api_key;
    else process.env.agentx_api_key = previousLower;
  }
});

test("accepts an explicit secret list", () => {
  const result = redactWorkerLog("worker secret", ["secret"]);
  expect(result).not.toContain("secret");
});
