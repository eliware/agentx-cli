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
