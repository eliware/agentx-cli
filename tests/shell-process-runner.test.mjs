import { EventEmitter } from "node:events";
import { afterEach, expect, jest, test } from "@jest/globals";

const children = [];
const spawn = jest.fn(() => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn();
  children.push(child);
  return child;
});
await jest.unstable_mockModule("node:child_process", () => ({ spawn }));
const { runShellProcess } = await import("../src/shell-process-runner.mjs");

afterEach(() => {
  jest.useRealTimers();
  children.length = 0;
  spawn.mockClear();
});

test("captures decoded streams and forwards live chunks", async () => {
  const stdout = jest.fn();
  const stderr = jest.fn();
  const result = runShellProcess({ file: "shell", args: [] }, "echo", "/work", {
    platform: "linux",
    timeoutMs: null,
    maxOutputLength: 20,
    writeStdout: stdout,
    writeStderr: stderr,
  });
  children[0].stdout.emit("data", Buffer.from([0xc3]));
  children[0].stdout.emit("data", Buffer.from([0xa9]));
  children[0].stderr.emit("data", Buffer.from("warning"));
  children[0].emit("close", 0, null);
  await expect(result).resolves.toMatchObject({ stdout: "é", stderr: "warning" });
  expect(stdout).toHaveBeenCalledWith("é");
  expect(stderr).toHaveBeenCalledWith("warning");
});

test("returns ordinary spawn errors and rejects missing launchers", async () => {
  const failure = runShellProcess({ file: "shell", args: [] }, "echo", "/work", {
    timeoutMs: null,
    maxOutputLength: 20,
  });
  children[0].emit("error", new Error("spawn failed"));
  await expect(failure).resolves.toMatchObject({ stderr: "spawn failed" });

  const missing = runShellProcess({ file: "shell", args: [] }, "echo", "/work", {
    timeoutMs: null,
    maxOutputLength: 20,
  });
  children[1].emit("error", Object.assign(new Error("missing"), { code: "ENOENT" }));
  await expect(missing).rejects.toThrow("missing");
});

test("ignores duplicate process events and keeps captured stderr on errors", async () => {
  const result = runShellProcess({ file: "shell", args: [] }, "echo", "/work", {
    timeoutMs: null,
    maxOutputLength: 20,
  });
  children[0].stderr.emit("data", "prior error");
  children[0].emit("error", new Error("late spawn error"));
  await expect(result).resolves.toMatchObject({ stderr: "prior error" });
  children[0].emit("close", 0, null);
  children[0].emit("error", new Error("duplicate error"));

  const noMessage = runShellProcess({ file: "shell", args: [] }, "echo", "/work", {
    timeoutMs: null,
    maxOutputLength: 100,
  });
  children[1].emit("error", new Error(""));
  await expect(noMessage).resolves.toMatchObject({
    stderr: "Unable to execute shell command",
  });
});

test("returns empty-command validation before it starts a process", async () => {
  await expect(runShellProcess({}, " ", "/work", {})).resolves.toMatchObject({
    outcome: { type: "exit", exit_code: 2 },
  });
  expect(spawn).not.toHaveBeenCalled();
});

test("marks timeout and abort events as interrupted results", async () => {
  jest.useFakeTimers();
  const timed = runShellProcess({ file: "shell", args: [] }, "sleep", "/work", {
    platform: "linux",
    timeoutMs: 5,
    maxOutputLength: 20,
  });
  await jest.advanceTimersByTimeAsync(5);
  children[0].emit("close", null, "SIGTERM");
  await expect(timed).resolves.toMatchObject({ outcome: { type: "timeout" } });

  const controller = new AbortController();
  const aborted = runShellProcess({ file: "shell", args: [] }, "sleep", "/work", {
    platform: "linux",
    timeoutMs: null,
    signal: controller.signal,
    maxOutputLength: 20,
  });
  controller.abort();
  children[1].emit("close", null, "SIGTERM");
  await expect(aborted).resolves.toMatchObject({ outcome: { type: "timeout" } });
});
