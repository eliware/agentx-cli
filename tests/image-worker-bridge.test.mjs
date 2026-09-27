import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { EventEmitter } from "node:events";

const spawn = jest.fn();
await jest.unstable_mockModule("node:child_process", () => ({ spawn }));
const { runImageInspectionProcess } = await import("../src/image-worker-bridge.mjs");

describe("image worker bridge", () => {
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

  test("decodes worker text and forwards usage", async () => {
    queueWorker({ stdout: JSON.stringify({ text: "inspected", usage: { inputTokens: 3 } }) });
    const onUsage = jest.fn();
    await expect(
      runImageInspectionProcess({ prompt: "look" }, { cwd: process.cwd(), onUsage }),
    ).resolves.toBe("inspected");
    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 3 });
    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringContaining("image-worker.mjs")],
      expect.objectContaining({ cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] }),
    );
  });

  test("normalizes worker spawn, exit, and malformed-output failures", async () => {
    queueWorker({ error: new Error("spawn failed") });
    await expect(runImageInspectionProcess({}, {})).resolves.toBe("ERROR: spawn failed");
    queueWorker({ stderr: "worker failed", code: 2 });
    await expect(runImageInspectionProcess({}, {})).resolves.toBe("ERROR: worker failed");
    queueWorker({ code: 3 });
    await expect(runImageInspectionProcess({}, {})).resolves.toBe(
      "ERROR: image worker exited with code 3",
    );
    queueWorker({ stdout: "{bad", stderr: "invalid json" });
    await expect(runImageInspectionProcess({}, {})).resolves.toBe(
      "ERROR: invalid image worker response: invalid json",
    );
    queueWorker({ stdout: "{bad" });
    await expect(runImageInspectionProcess({}, {})).resolves.toBe(
      "ERROR: invalid image worker response",
    );
    queueWorker({ stdout: JSON.stringify({ error: "partial failure" }), code: 7 });
    await expect(runImageInspectionProcess({}, {})).resolves.toBe("ERROR: partial failure");
    queueWorker({ stdout: "{bad", code: 2 });
    await expect(runImageInspectionProcess({}, {})).resolves.toBe(
      "ERROR: image worker exited with code 2",
    );
    queueWorker({ stdout: "{}", code: 7 });
    await expect(runImageInspectionProcess({}, {})).resolves.toBe(
      "ERROR: image worker exited with code 7",
    );
    queueWorker({ stdout: "{}" });
    await expect(runImageInspectionProcess({}, {})).resolves.toBe(
      "The image inspection returned no text.",
    );
  });

  test("serializes concurrent processes with the same branch parent", async () => {
    queueWorker({ stdout: JSON.stringify({ text: "first" }) });
    queueWorker({ stdout: JSON.stringify({ text: "second" }) });
    const options = { cwd: process.cwd(), previousResponseId: "parent" };
    await expect(
      Promise.all([runImageInspectionProcess({}, options), runImageInspectionProcess({}, options)]),
    ).resolves.toEqual(["first", "second"]);
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  test("continues queued work after a process launch rejection", async () => {
    spawn.mockImplementationOnce(() => {
      throw new Error("worker launch failed");
    });
    const first = runImageInspectionProcess({}, { cwd: "/queue" });
    queueWorker({ stdout: JSON.stringify({ text: "recovered" }) });
    const second = runImageInspectionProcess({}, { cwd: "/queue" });
    await expect(first).rejects.toThrow("worker launch failed");
    await expect(second).resolves.toBe("recovered");
  });

  test("uses the response ID when no predecessor is supplied", async () => {
    queueWorker({ stdout: JSON.stringify({ text: "done" }) });
    await expect(runImageInspectionProcess({}, { responseId: "response" })).resolves.toBe("done");
    queueWorker({ stdout: JSON.stringify({ text: "default options" }) });
    await expect(runImageInspectionProcess({})).resolves.toBe("default options");
  });
});
