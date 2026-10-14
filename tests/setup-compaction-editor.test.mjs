import { afterEach, describe, expect, test } from "@jest/globals";
import { readEnvState } from "../src/setup-env.mjs";
import { editCompaction } from "../src/setup-compaction-editor.mjs";
import {
  cleanupSetupEnvStates,
  createSetupEnvState,
  SetupTestOutput,
} from "../test-fixtures/setup-editor-helpers.mjs";

afterEach(cleanupSetupEnvStates);

describe("setup compaction editor", () => {
  test("ignores blank or invalid input and saves valid thresholds", async () => {
    const state = await createSetupEnvState({ AGENTX_COMPACTION_THRESHOLD: "200000" });
    const output = new SetupTestOutput();
    await editCompaction({ question: async () => " " }, state, output);
    await editCompaction({ question: async () => "not-a-number" }, state, output);
    expect(output.text).toContain("Enter a positive token count.");
    await editCompaction({ question: async () => "270001" }, state, output);
    expect(output.text).toContain("Warning: jumbo prompts cost 2x above 270k tokens.");
    await editCompaction({ question: async () => "123abc" }, state, output);
    await expect(readEnvState(state.filePath)).resolves.toMatchObject({
      values: { AGENTX_COMPACTION_THRESHOLD: "123" },
    });
  });
});
