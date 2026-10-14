import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { EventEmitter } from "node:events";

const spawn = jest.fn();
await jest.unstable_mockModule("node:child_process", () => ({ spawn }));
const { runImageInspectionProcess } = await import("../src/image-worker-bridge.mjs");

describe("image worker bridge", () => {
  function queueWorker(text) {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    spawn.mockImplementationOnce(() => {
      queueMicrotask(() => {
        child.stdout.emit("data", JSON.stringify({ text }));
        child.emit("close", 0);
      });
      return child;
    });
  }

  beforeEach(() => spawn.mockReset());

  test("serializes concurrent processes with the same branch parent", async () => {
    queueWorker("first");
    queueWorker("second");
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
    queueWorker("recovered");
    const second = runImageInspectionProcess({}, { cwd: "/queue" });
    await expect(first).rejects.toThrow("worker launch failed");
    await expect(second).resolves.toBe("recovered");
  });

  test("uses default queue keys and response IDs", async () => {
    queueWorker("default options");
    await expect(runImageInspectionProcess({})).resolves.toBe("default options");
    queueWorker("response key");
    await expect(runImageInspectionProcess({}, { responseId: "response" })).resolves.toBe(
      "response key",
    );
  });
});
