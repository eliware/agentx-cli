import { expect, test } from "@jest/globals";
import { createImageWorkerEnvironment } from "../src/image-worker-environment.mjs";

test("keeps runtime keys and both supported API key names", () => {
  expect(
    createImageWorkerEnvironment({
      PATH: "path",
      windir: "windows",
      TMP: "temp",
      agentx_api_key: "lower-key",
      AGENTX_API_KEY: "upper-key",
      PRIVATE_TOKEN: "secret",
    }),
  ).toEqual({
    PATH: "path",
    windir: "windows",
    TMP: "temp",
    agentx_api_key: "lower-key",
    AGENTX_API_KEY: "upper-key",
  });
});

test("uses process environment by default", () => {
  expect(createImageWorkerEnvironment()).toEqual(createImageWorkerEnvironment(process.env));
});
