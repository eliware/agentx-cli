import { afterEach, describe, expect, test } from "@jest/globals";
import { API_PRICING } from "@eliware/openai";
import { readFile } from "node:fs/promises";
import { choices, editValue } from "../src/setup-editors.mjs";
import { readEnvState } from "../src/setup-env.mjs";
import {
  cleanupSetupEnvStates,
  createSetupEnvState,
  SetupTestOutput,
} from "../test-fixtures/setup-editor-helpers.mjs";

afterEach(cleanupSetupEnvStates);

describe("setup setting editors", () => {
  test("uses the OpenAI pricing catalog for model choices", () => {
    expect(choices.model).toEqual(Object.keys(API_PRICING));
  });

  test("persists only a changed setting choice", async () => {
    const state = await createSetupEnvState({ AGENTX_OUTPUT_VERBOSITY: "low" });
    await editValue(
      {},
      new SetupTestOutput(),
      { question: async () => "low" },
      state,
      "AGENTX_OUTPUT_VERBOSITY",
      "Output",
      choices.verbosity,
    );
    await expect(readFile(state.filePath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await editValue(
      {},
      new SetupTestOutput(),
      { question: async () => "medium" },
      state,
      "AGENTX_OUTPUT_VERBOSITY",
      "Output",
      choices.verbosity,
    );
    await expect(readEnvState(state.filePath)).resolves.toMatchObject({
      values: { AGENTX_OUTPUT_VERBOSITY: "medium" },
    });
  });
});
