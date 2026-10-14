import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { EventEmitter } from "node:events";

const children = [];
const spawn = jest.fn(() => {
  const child = new EventEmitter();
  child.pid = 1234;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn();
  children.push(child);
  return child;
});
await jest.unstable_mockModule("node:child_process", () => ({ spawn }));
const { executeShellCommand } = await import("../src/tool-shell.mjs");

describe("Windows shell process termination", () => {
  afterEach(() => {
    jest.useRealTimers();
    children.length = 0;
    spawn.mockClear();
  });

  test("falls back to child termination when taskkill fails and escalates with /F", async () => {
    jest.useFakeTimers();
    const resultPromise = executeShellCommand("echo hello", "C:\\project", {
      platform: "win32",
      timeoutMs: 10,
    });
    await jest.advanceTimersByTimeAsync(10);
    expect(spawn.mock.calls[1]).toEqual([
      "taskkill",
      ["/PID", "1234", "/T"],
      expect.objectContaining({ windowsHide: true, stdio: "ignore" }),
    ]);
    children[1].emit("close", 1);
    expect(children[0].kill).toHaveBeenCalledWith("SIGTERM");
    await jest.advanceTimersByTimeAsync(250);
    expect(spawn.mock.calls[2][0]).toBe("taskkill");
    expect(spawn.mock.calls[2][1]).toEqual(["/PID", "1234", "/T", "/F"]);
    children[2].emit("close", 0);
    children[0].emit("close", null, "SIGTERM");
    await expect(resultPromise).resolves.toMatchObject({ outcome: { type: "timeout" } });
  });

  test("falls back to child termination when taskkill cannot start", async () => {
    jest.useFakeTimers();
    const resultPromise = executeShellCommand("echo hello", "C:\\project", {
      platform: "win32",
      timeoutMs: 10,
    });
    await jest.advanceTimersByTimeAsync(10);
    children[1].emit("error", new Error("taskkill unavailable"));
    expect(children[0].kill).toHaveBeenCalledWith("SIGTERM");
    children[0].emit("close", null, "SIGTERM");
    await expect(resultPromise).resolves.toMatchObject({ outcome: { type: "timeout" } });
  });
});
