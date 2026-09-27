import { afterEach, describe, expect, test } from "@jest/globals";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  choices,
  editApiKey,
  editCompaction,
  editValue,
  selectChoice,
} from "../src/setup-editors.mjs";
import { readEnvState } from "../src/setup-env.mjs";

class Terminal extends EventEmitter {
  constructor(isTTY = true) {
    super();
    this.isTTY = isTTY;
    this.raw = false;
  }
  setRawMode(value) {
    this.raw = value;
  }
  resume() {}
  pause() {}
}

class Output {
  text = "";
  write(value) {
    this.text += value;
  }
}

let tempDirs = [];
afterEach(async () => {
  await Promise.all(tempDirs.map((directory) => rm(directory, { recursive: true, force: true })));
  tempDirs = [];
});

async function envState(values = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agentx-editors-"));
  tempDirs.push(directory);
  return { filePath: path.join(directory, ".agentx"), text: "", values };
}

const send = (input, value) => setImmediate(() => input.emit("data", Buffer.from(value)));

describe("setup setting editors", () => {
  test("matches interactive, numeric, and textual choices and rejects invalid input", async () => {
    expect(choices.model[0]).toBe("gpt-6-luna");
    const input = new Terminal();
    const interactive = selectChoice(input, new Output(), {}, "Model", ["one", "two"], "two");
    send(input, "\r");
    await expect(interactive).resolves.toBe("two");
    expect(input.raw).toBe(false);

    const rl = { question: async () => "2" };
    await expect(selectChoice({}, new Output(), rl, "Model", ["one", "two"], "one")).resolves.toBe(
      "two",
    );
    await expect(
      selectChoice({}, new Output(), { question: async () => "tw" }, "Model", ["one", "two"], ""),
    ).resolves.toBe("two");
    await expect(
      selectChoice({}, new Output(), { question: async () => "nope" }, "Model", ["one"], ""),
    ).resolves.toBeNull();
  });

  test("persists only a changed setting choice", async () => {
    const state = await envState({ AGENTX_OUTPUT_VERBOSITY: "low" });
    const rl = { question: async () => "low" };
    await editValue(
      {},
      new Output(),
      rl,
      state,
      "AGENTX_OUTPUT_VERBOSITY",
      "Output",
      choices.verbosity,
    );
    await expect(readFile(state.filePath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });

    await editValue(
      {},
      new Output(),
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

  test("requires a nonblank API key and preserves the existing key on blank input", async () => {
    const state = await envState({ AGENTX_API_KEY: "" });
    const input = new Terminal();
    const output = new Output();
    const pending = editApiKey(input, state, output);
    send(input, "\r");
    await new Promise((resolve) => setImmediate(resolve));
    send(input, "valid-key\r");
    await expect(pending).resolves.toBe("API key saved.");
    expect(output.text).toContain("API key is required.");
    await expect(readEnvState(state.filePath)).resolves.toMatchObject({
      values: { AGENTX_API_KEY: "valid-key" },
    });

    const existing = await envState({ AGENTX_API_KEY: "existing-key" });
    const existingInput = new Terminal();
    const existingOutput = new Output();
    const existingEdit = editApiKey(existingInput, existing, existingOutput);
    send(existingInput, "\r");
    await expect(existingEdit).resolves.toBe("API key saved.");
    expect(existingOutput.text).toContain("********ting-key");
    await expect(readEnvState(existing.filePath)).resolves.toMatchObject({
      values: { AGENTX_API_KEY: "existing-key" },
    });
  });

  test("ignores blank or invalid compaction input and saves valid thresholds", async () => {
    const state = await envState({ AGENTX_COMPACTION_THRESHOLD: "200000" });
    const output = new Output();
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
