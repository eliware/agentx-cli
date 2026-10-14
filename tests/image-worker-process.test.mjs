import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { EventEmitter } from "node:events";

const spawn = jest.fn();
await jest.unstable_mockModule("node:child_process", () => ({ spawn }));
const { runImageInspectionProcess } = await import("../src/image-worker-process.mjs");

describe("image worker process", () => {
  function queueWorker({ stdout = "", stderr = "", code = 0, error } = {}) {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    spawn.mockImplementationOnce(() => {
      queueMicrotask(() => {
        if (stdout) child.stdout.emit("data", stdout);
        if (stderr) child.stderr.emit("data", stderr);
        if (error) child.emit("error", error);
        else child.emit("close", code);
      });
      return child;
    });
  }

  beforeEach(() => spawn.mockReset());

  test("collects child output and spawn options", async () => {
    queueWorker({ stdout: JSON.stringify({ text: "inspected", usage: { inputTokens: 3 } }) });
    await expect(
      runImageInspectionProcess({ prompt: "look" }, { cwd: process.cwd() }),
    ).resolves.toEqual({
      stdout: JSON.stringify({ text: "inspected", usage: { inputTokens: 3 } }),
      stderr: "",
      code: 0,
    });
    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringContaining("image-worker.mjs")],
      expect.objectContaining({ cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] }),
    );
  });

  test("passes only runtime variables and AgentX credentials to the worker", async () => {
    queueWorker({ stdout: JSON.stringify({ text: "ok" }) });
    const previousSecret = process.env.CODEX_SECRET_TEST;
    const previousKey = process.env.AGENTX_API_KEY;
    process.env.CODEX_SECRET_TEST = "private";
    process.env.AGENTX_API_KEY = "agentx-key";
    try {
      await runImageInspectionProcess({ prompt: "look" }, {});
      const childEnv = spawn.mock.calls[0][2].env;
      expect(childEnv.AGENTX_API_KEY).toBe("agentx-key");
      expect(childEnv.AGENTX_IMAGE_REQUEST).toContain('"prompt":"look"');
      expect(childEnv).not.toHaveProperty("CODEX_SECRET_TEST");
      expect(
        Object.keys(childEnv).every((key) =>
          [
            "path",
            "systemroot",
            "windir",
            "temp",
            "tmp",
            "agentx_api_key",
            "agentx_api_key",
            "agentx_image_request",
          ].includes(key.toLowerCase()),
        ),
      ).toBe(true);
    } finally {
      if (previousSecret === undefined) delete process.env.CODEX_SECRET_TEST;
      else process.env.CODEX_SECRET_TEST = previousSecret;
      if (previousKey === undefined) delete process.env.AGENTX_API_KEY;
      else process.env.AGENTX_API_KEY = previousKey;
    }
  });

  test("uses an empty options object when options are undefined", async () => {
    queueWorker({ stdout: JSON.stringify({ text: "default options" }) });
    await expect(runImageInspectionProcess({}, undefined)).resolves.toEqual({
      stdout: JSON.stringify({ text: "default options" }),
      stderr: "",
      code: 0,
    });
  });

  test("collects child stderr while the worker returns valid text", async () => {
    queueWorker({ stdout: JSON.stringify({ text: "ok" }), stderr: "warning" });
    await expect(runImageInspectionProcess({}, {})).resolves.toEqual({
      stdout: JSON.stringify({ text: "ok" }),
      stderr: "warning",
      code: 0,
    });
  });

  test("reports child launch errors", async () => {
    queueWorker({ error: new Error("spawn failed") });
    await expect(runImageInspectionProcess({}, {})).resolves.toEqual({
      error: new Error("spawn failed"),
    });
  });
});
