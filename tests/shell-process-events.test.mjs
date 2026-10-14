import { EventEmitter } from "node:events";
import { expect, jest, test } from "@jest/globals";
import { attachShellProcessEvents } from "../src/shell-process-events.mjs";

test("forwards child process events to handlers", () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  const handlers = { error: jest.fn(), stdout: jest.fn(), stderr: jest.fn(), close: jest.fn() };
  attachShellProcessEvents(child, handlers);
  child.emit("close", 0, null);
  expect(handlers.close).toHaveBeenCalledWith(0, null);
});
