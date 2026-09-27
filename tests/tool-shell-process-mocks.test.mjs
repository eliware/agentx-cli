import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { EventEmitter } from "node:events";

const children = [];
const spawn = jest.fn(() => {
  const child = new EventEmitter();
  child.pid = 555;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn();
  children.push(child);
  return child;
});
await jest.unstable_mockModule("node:child_process", () => ({ spawn }));
const { executeShellCommand, shellExec } = await import("../src/tool-shell.mjs");

describe("shell process lifecycle edge cases", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    children.length = 0;
    spawn.mockReset();
    spawn.mockImplementation(() => {
      const child = new EventEmitter();
      child.pid = 555;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = jest.fn();
      children.push(child);
      return child;
    });
  });

  test("terminates POSIX process groups and falls back when group signaling fails", async () => {
    jest.useFakeTimers();
    const kill = jest.spyOn(process, "kill").mockImplementation(() => true);
    const promise = executeShellCommand("sleep 1", "/tmp", {
      platform: "linux",
      timeoutMs: 10,
    });
    await jest.advanceTimersByTimeAsync(10);
    expect(kill).toHaveBeenCalledWith(-555, "SIGTERM");
    kill.mockImplementation(() => {
      throw new Error("group unavailable");
    });
    await jest.advanceTimersByTimeAsync(250);
    expect(kill).toHaveBeenCalledWith(-555, "SIGKILL");
    expect(children[0].kill).toHaveBeenNthCalledWith(1, "SIGKILL");
    children[0].emit("close", null, "SIGTERM");
    await expect(promise).resolves.toMatchObject({ outcome: { type: "timeout" } });
    kill.mockRestore();
  });

  test("falls back to child.kill when the spawned process has no pid", async () => {
    jest.useFakeTimers();
    const promise = executeShellCommand("sleep 1", "/tmp", {
      platform: "linux",
      timeoutMs: 10,
    });
    children[0].pid = undefined;
    await jest.advanceTimersByTimeAsync(10);
    expect(children[0].kill).toHaveBeenCalledWith("SIGTERM");
    children[0].emit("close", null, "SIGTERM");
    await expect(promise).resolves.toMatchObject({ outcome: { type: "timeout" } });
  });

  test("decodes streams, truncates output, and forwards live chunks", async () => {
    const stdout = jest.fn();
    const stderr = jest.fn();
    const promise = executeShellCommand("echo", "/tmp", {
      platform: "linux",
      maxOutputLength: 10,
      writeStdout: stdout,
      writeStderr: stderr,
    });
    children[0].stdout.emit("data", Buffer.from("0123456789abcdef"));
    children[0].stderr.emit("data", Buffer.from("warning"));
    children[0].emit("close", 0, null);
    await expect(promise).resolves.toMatchObject({
      stdout: "0123456789",
      stderr: "warning",
      outcome: { type: "exit", exit_code: 0 },
    });
    expect(stdout).toHaveBeenCalledWith("0123456789abcdef");
    expect(stderr).toHaveBeenCalledWith("warning");
  });

  test("uses the truncation note when output limits exceed its length", async () => {
    const promise = executeShellCommand("echo", "/tmp", {
      platform: "linux",
      maxOutputLength: 30,
    });
    children[0].stdout.emit("data", "x".repeat(40));
    children[0].emit("close", 0, null);
    await expect(promise).resolves.toMatchObject({
      stdout: `${"x".repeat(11)}\n[output truncated]`,
    });
  });

  test("converts spawn errors to results and retries missing Windows launchers", async () => {
    const ordinaryFailure = executeShellCommand("echo", "/tmp", { platform: "linux" });
    children[0].emit("error", new Error("spawn failed"));
    await expect(ordinaryFailure).resolves.toMatchObject({
      stderr: "spawn failed",
      outcome: { type: "exit", exit_code: 1 },
    });

    const fallback = executeShellCommand("echo", "C:\\work", { platform: "win32" });
    children[1].emit("error", Object.assign(new Error("missing pwsh"), { code: "ENOENT" }));
    await Promise.resolve();
    children[2].emit("close", 0, null);
    await expect(fallback).resolves.toMatchObject({ outcome: { type: "exit", exit_code: 0 } });
  });

  test("reports the final launcher error when every Windows shell is missing", async () => {
    const resultPromise = executeShellCommand("echo", "C:\\work", { platform: "win32" });
    for (let index = 0; index < 3; index += 1) {
      children[index].emit(
        "error",
        Object.assign(new Error(`missing ${index}`), { code: "ENOENT" }),
      );
      await Promise.resolve();
    }
    await expect(resultPromise).resolves.toMatchObject({
      stderr: "missing 2",
      outcome: { type: "exit", exit_code: 1 },
    });
  });

  test("handles an already-aborted process and synchronous spawn failures", async () => {
    jest.useFakeTimers();
    const controller = new AbortController();
    controller.abort();
    const abortedPromise = executeShellCommand("echo", "C:\\work", {
      platform: "win32",
      signal: controller.signal,
    });
    children[1].emit("close", 0);
    children[0].emit("close", null, "SIGTERM");
    await expect(abortedPromise).resolves.toMatchObject({ outcome: { type: "timeout" } });

    spawn.mockImplementationOnce(() => {
      throw new Error("spawn wrapper failed");
    });
    await expect(executeShellCommand("echo", "/tmp", { platform: "linux" })).resolves.toMatchObject(
      {
        stderr: "spawn wrapper failed",
        outcome: { type: "exit", exit_code: 1 },
      },
    );
  });

  test("streams output through the interactive shell adapter", async () => {
    const stdout = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
    const resultPromise = shellExec("echo", "/tmp");
    children[0].stdout.emit("data", "live output");
    children[0].stderr.emit("data", "live error");
    children[0].emit("close", 0, null);

    await expect(resultPromise).resolves.toMatchObject({
      stdout: "live output",
      stderr: "live error",
      outcome: { type: "exit", exit_code: 0 },
    });
    expect(stdout).toHaveBeenCalledWith("live output");
    expect(stderr).toHaveBeenCalledWith("live error");
  });
});
