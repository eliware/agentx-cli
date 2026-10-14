import { describe, expect, test } from "@jest/globals";
import { migrateSetupValues } from "../src/setup-env-migration.mjs";

describe("setup environment migration", () => {
  test("upgrades the legacy default and records the current version", () => {
    const result = migrateSetupValues(
      { AGENTX_CONFIG_VERSION: "1", AGENTX_MODEL: "gpt-5.6-luna" },
      "AGENTX_CONFIG_VERSION=1\nAGENTX_MODEL=gpt-5.6-luna\n",
    );
    expect(result.values).toEqual({ AGENTX_MODEL: "gpt-6-luna" });
    expect(result.updates).toEqual({ AGENTX_CONFIG_VERSION: "2", AGENTX_MODEL: "gpt-6-luna" });
  });

  test("preserves custom models and does not migrate empty files", () => {
    expect(migrateSetupValues({ AGENTX_MODEL: "gpt-5.6-terra" }, "existing")).toEqual({
      values: { AGENTX_MODEL: "gpt-5.6-terra" },
      updates: { AGENTX_CONFIG_VERSION: "2" },
    });
    expect(migrateSetupValues({ AGENTX_MODEL: "gpt-5.6-luna" }, "").updates).toEqual({});
  });
});
