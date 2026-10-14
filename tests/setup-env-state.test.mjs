import { expect, jest, test } from "@jest/globals";
import { loadSetupEnvState } from "../src/setup-env-state.mjs";

test("loads known values and persists required migration updates", async () => {
  const persist = jest.fn(async () => "saved configuration");
  await expect(
    loadSetupEnvState(
      "/workspace/config/.agentx",
      "AGENTX_CONFIG_VERSION=1\nAGENTX_MODEL=gpt-5.6-luna\nCUSTOM=value\n",
      persist,
    ),
  ).resolves.toEqual({
    filePath: "/workspace/config/.agentx",
    text: "saved configuration",
    values: { AGENTX_API_KEY: "", AGENTX_MODEL: "gpt-6-luna" },
  });
  expect(persist).toHaveBeenCalledWith(
    "/workspace/config/.agentx",
    { AGENTX_CONFIG_VERSION: "2", AGENTX_MODEL: "gpt-6-luna" },
    expect.stringContaining("CUSTOM=value"),
  );
});

test("does not persist state for a missing or empty configuration", async () => {
  const persist = jest.fn();
  await expect(loadSetupEnvState("/workspace/config/.agentx", "", persist)).resolves.toEqual({
    filePath: "/workspace/config/.agentx",
    text: "",
    values: { AGENTX_API_KEY: "" },
  });
  expect(persist).not.toHaveBeenCalled();
});
