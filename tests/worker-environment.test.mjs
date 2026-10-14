import { expect, test } from "@jest/globals";
import { buildWorkerEnvironment } from "../src/worker-environment.mjs";

test("keeps supported runtime values and drops unrelated values", () => {
  expect(buildWorkerEnvironment({ PATH: "/bin", AGENTX_API_KEY: "key", OTHER: "secret" })).toEqual({
    PATH: "/bin",
    AGENTX_API_KEY: "key",
  });
});

test("supports both API key names and omits missing values", () => {
  expect(
    buildWorkerEnvironment({ agentx_api_key: "key", NODE_OPTIONS: "--trace-warnings" }),
  ).toEqual({
    agentx_api_key: "key",
    NODE_OPTIONS: "--trace-warnings",
  });
});
