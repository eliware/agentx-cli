import { afterEach, describe, expect, test } from "@jest/globals";
import { readEnvState } from "../src/setup-env.mjs";
import { editApiKey } from "../src/setup-api-key-editor.mjs";
import {
  cleanupSetupEnvStates,
  createSetupEnvState,
  sendSetupInput,
  SetupTestOutput,
  SetupTestTerminal,
} from "../test-fixtures/setup-editor-helpers.mjs";

afterEach(cleanupSetupEnvStates);

describe("setup API key editor", () => {
  test("requires a key and preserves the current key when input is blank", async () => {
    const state = await createSetupEnvState({ AGENTX_API_KEY: "" });
    const input = new SetupTestTerminal();
    const output = new SetupTestOutput();
    const pending = editApiKey(input, state, output);
    sendSetupInput(input, "\r");
    await new Promise((resolve) => setImmediate(resolve));
    sendSetupInput(input, "valid-key\r");
    await expect(pending).resolves.toBe("API key saved.");
    expect(output.text).toContain("API key is required.");
    await expect(readEnvState(state.filePath)).resolves.toMatchObject({
      values: { AGENTX_API_KEY: "valid-key" },
    });

    const existing = await createSetupEnvState({ AGENTX_API_KEY: "existing-key" });
    const existingInput = new SetupTestTerminal();
    const existingOutput = new SetupTestOutput();
    const existingEdit = editApiKey(existingInput, existing, existingOutput);
    sendSetupInput(existingInput, "\r");
    await expect(existingEdit).resolves.toBe("API key saved.");
    expect(existingOutput.text).toContain("********ting-key");
    await expect(readEnvState(existing.filePath)).resolves.toMatchObject({
      values: { AGENTX_API_KEY: "existing-key" },
    });
  });
});
