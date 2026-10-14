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

  test("keeps queues separate when response IDs differ", async () => {
    const children = [];
    spawn.mockImplementation(() => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      children.push(child);
      return child;
    });
    const first = runImageInspectionProcess({}, { cwd: "/queue", responseId: "first" });
    const second = runImageInspectionProcess({}, { cwd: "/queue", responseId: "second" });
    await new Promise((resolve) => setImmediate(resolve));
    expect(spawn).toHaveBeenCalledTimes(2);
    for (const [index, child] of children.entries()) {
      child.stdout.emit("data", JSON.stringify({ text: `result-${index}` }));
      child.emit("close", 0);
    }
    await expect(Promise.all([first, second])).resolves.toEqual(["result-0", "result-1"]);
    queueWorker("default queue key");
    await expect(runImageInspectionProcess({}, undefined)).resolves.toBe("default queue key");
  });
});
