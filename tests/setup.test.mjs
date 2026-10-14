import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSetup } from "../src/setup.mjs";
import { readEnvState, writeEnvState } from "../src/setup-env.mjs";

class FakeTerminal extends EventEmitter {
  constructor() {
    super();
    this.isTTY = true;
    this.raw = false;
    this.resumed = false;
  }
  setRawMode(value) {
    this.raw = value;
  }
  resume() {
    this.resumed = true;
  }
  pause() {
    this.paused = true;
  }
}
class FakeOutput extends EventEmitter {
  constructor() {
    super();
    this.isTTY = true;
    this.text = "";
  }
  write(value) {
    this.text += value;
  }
}

async function expectSetupToFinish(run, timeoutMs) {
  let timer;
  try {
    await expect(
      Promise.race([
        run,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("setup flow timed out")), timeoutMs);
        }),
      ]),
    ).resolves.toBeUndefined();
  } finally {
    clearTimeout(timer);
  }
}

describe("interactive setup", () => {
  test("rejects non-interactive terminals", async () => {
    const stdout = new FakeOutput();
    stdout.isTTY = false;
    await runSetup({ stdin: {}, stdout });
    expect(stdout.text).toContain("requires an interactive terminal");
  });
});

describe("interactive setup menu flow", () => {
  let directory;
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "agentx-setup-flow-"));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const drive = async (readlineInput, values) => {
    for (const value of values) {
      const interval = process.platform === "win32" ? 150 : 50;
      await new Promise((resolve) =>
        setTimeout(() => {
          readlineInput.emit("data", Buffer.from(`${value}\n`));
          resolve();
        }, interval),
      );
    }
  };

  test("visits every menu item on a TTY without waiting indefinitely", async () => {
    const stdin = { isTTY: true };
    const readlineInput = new FakeTerminal();
    const stdout = new FakeOutput();
    const configPath = path.join(directory, ".agentx");
    const run = runSetup({ stdin, stdout, configPath, readlineInput });
    await drive(readlineInput, [
      "1",
      "api-key",
      "2",
      "1",
      "3",
      "1",
      "4",
      "1",
      "5",
      "1",
      "6",
      "1",
      "7",
      "300000",
      "8",
    ]);
    await expectSetupToFinish(run, 5000);
    const saved = await readEnvState(configPath);
    expect(saved.values).toMatchObject({
      AGENTX_API_KEY: "api-key",
      AGENTX_COMPACTION_THRESHOLD: "300000",
    });
    expect(stdout.text).toContain("Warning: jumbo prompts cost 2x above 270k tokens.");
  }, 10000);

  test("loads persisted model over defaults and can select GPT-6 Luna", async () => {
    const stdin = { isTTY: true };
    const readlineInput = new FakeTerminal();
    const stdout = new FakeOutput();
    const configPath = path.join(directory, ".agentx");
    await writeEnvState(configPath, { AGENTX_MODEL: "gpt-5.6-terra" });
    const run = runSetup({ stdin, stdout, configPath, readlineInput });
    await drive(readlineInput, ["2", "gpt-6-luna", "8"]);
    await expect(run).resolves.toBeUndefined();
    expect((await readEnvState(configPath)).values.AGENTX_MODEL).toBe("gpt-6-luna");
    expect(stdout.text).toContain("Model (gpt-5.6-terra)");
  }, 5000);

  test("uses the readline fallback and accepts textual choices", async () => {
    const stdin = { isTTY: true };
    const readlineInput = new FakeTerminal();
    const stdout = new FakeOutput();
    const configPath = path.join(directory, ".agentx");
    const run = runSetup({ stdin, stdout, configPath, readlineInput });
    await drive(readlineInput, ["unknown", "model", "gpt-5.6-terra", "quit"]);
    await expectSetupToFinish(run, 2000);
    expect((await readEnvState(configPath)).values.AGENTX_MODEL).toBe("gpt-5.6-terra");
    expect(stdout.text).toContain("Unknown option.");
  }, 5000);
});

describe("setup coverage edge cases", () => {
  test("supports default arguments in a non-interactive terminal", async () => {
    const defaultStdout = new FakeOutput();
    defaultStdout.isTTY = false;
    await runSetup({ stdout: defaultStdout });
    expect(defaultStdout.text).toContain("requires an interactive terminal");
  });
});

describe("setup branch completion", () => {
  test("routes raw menu compaction selection through the editor workflow", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "agentx-raw-menu-"));
    const menuInput = new FakeTerminal();
    const readlineInput = new FakeTerminal();
    const configPath = path.join(directory, ".agentx");
    try {
      const run = runSetup({
        stdin: menuInput,
        stdout: new FakeOutput(),
        configPath,
        readlineInput,
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      menuInput.emit("data", Buffer.from("7"));
      await new Promise((resolve) => setTimeout(resolve, 20));
      readlineInput.emit("data", Buffer.from("123456\n"));
      await new Promise((resolve) => setTimeout(resolve, 20));
      menuInput.emit("data", Buffer.from("8"));
      await run;
      expect((await readEnvState(configPath)).values.AGENTX_COMPACTION_THRESHOLD).toBe("123456");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 5000);

  test("covers omitted runSetup arguments", async () => {
    const originalWrite = process.stdout.write;
    const originalStdinTTY = process.stdin.isTTY;
    const originalStdoutTTY = process.stdout.isTTY;
    process.stdout.write = () => true;
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: false });
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: false });
    try {
      await runSetup();
    } finally {
      process.stdout.write = originalWrite;
      Object.defineProperty(process.stdin, "isTTY", {
        configurable: true,
        value: originalStdinTTY,
      });
      Object.defineProperty(process.stdout, "isTTY", {
        configurable: true,
        value: originalStdoutTTY,
      });
    }
  });
});
