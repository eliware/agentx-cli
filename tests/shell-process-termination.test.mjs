import { EventEmitter } from "node:events";
import { expect, jest, test } from "@jest/globals";
import { startShellTermination } from "../src/shell-process-termination.mjs";

test("starts a timeout only for a positive duration", () => {
  jest.useFakeTimers();
  const child = { pid: undefined, kill: jest.fn() };
  const onTimeout = jest.fn();
  const cleanup = startShellTermination({
    child,
    timeoutMs: null,
    signal: new EventEmitter(),
    platform: "win32",
    onTimeout,
    onInterrupt: jest.fn(),
  });
  jest.advanceTimersByTime(1000);
  expect(onTimeout).not.toHaveBeenCalled();
  cleanup();
  jest.useRealTimers();
});

test("terminates after a timeout and ignores a timeout after completion", () => {
  jest.useFakeTimers();
  const child = { pid: undefined, kill: jest.fn() };
  const onTimeout = jest.fn();
  const cleanup = startShellTermination({
    child,
    timeoutMs: 10,
    platform: "win32",
    onTimeout,
    onInterrupt: jest.fn(),
  });
  jest.advanceTimersByTime(10);
  expect(onTimeout).toHaveBeenCalledTimes(1);
  expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  jest.advanceTimersByTime(250);
  expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  cleanup();

  const completeChild = { pid: undefined, kill: jest.fn() };
  const complete = startShellTermination({
    child: completeChild,
    timeoutMs: 10,
    platform: "win32",
    onTimeout,
    onInterrupt: jest.fn(),
    shouldTerminate: () => false,
  });
  jest.advanceTimersByTime(10);
  expect(onTimeout).toHaveBeenCalledTimes(1);
  expect(completeChild.kill).not.toHaveBeenCalled();
  complete();
  jest.useRealTimers();
});

test("ignores abort events after completion or after a prior termination", () => {
  const listeners = new Map();
  const signal = {
    aborted: false,
    addEventListener: (event, callback) => listeners.set(event, callback),
    removeEventListener: (event) => listeners.delete(event),
  };
  const interrupt = jest.fn();
  const child = { pid: undefined, kill: jest.fn() };
  const cleanup = startShellTermination({
    child,
    timeoutMs: null,
    signal,
    platform: "win32",
    onTimeout: jest.fn(),
    onInterrupt: interrupt,
    shouldTerminate: () => false,
  });
  listeners.get("abort")();
  expect(interrupt).not.toHaveBeenCalled();
  cleanup();
  expect(listeners.has("abort")).toBe(false);
});

test("does not request termination twice after timeout", () => {
  jest.useFakeTimers();
  try {
    const signal = new EventTarget();
    const child = { pid: undefined, kill: jest.fn() };
    const onInterrupt = jest.fn();
    const cleanup = startShellTermination({
      child,
      timeoutMs: 5,
      signal,
      platform: "win32",
      onTimeout: jest.fn(),
      onInterrupt,
    });
    jest.advanceTimersByTime(5);
    signal.dispatchEvent(new Event("abort"));
    expect(onInterrupt).toHaveBeenCalled();
    expect(child.kill).toHaveBeenCalledTimes(1);
    cleanup();
  } finally {
    jest.useRealTimers();
  }
});

test("handles an already aborted signal immediately", () => {
  const child = { pid: undefined, kill: jest.fn() };
  const onInterrupt = jest.fn();
  const cleanup = startShellTermination({
    child,
    timeoutMs: null,
    signal: { aborted: true },
    platform: "win32",
    onTimeout: jest.fn(),
    onInterrupt,
  });
  expect(onInterrupt).toHaveBeenCalledTimes(1);
  expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  cleanup();
});
