import { EventEmitter } from "node:events";
import { expect, jest, test } from "@jest/globals";

const killers = [];
const spawn = jest.fn(() => {
  const killer = new EventEmitter();
  killers.push(killer);
  return killer;
});
await jest.unstable_mockModule("node:child_process", () => ({ spawn }));
const { killShellProcess } = await import("../src/shell-termination.mjs");

test("kills process groups and falls back to child termination", () => {
  const child = { pid: 123, kill: jest.fn() };
  const processKill = jest.spyOn(process, "kill").mockImplementation(() => true);
  killShellProcess(child, "SIGTERM", "linux");
  expect(processKill).toHaveBeenCalledWith(-123, "SIGTERM");
  processKill.mockImplementation(() => {
    throw new Error("group is unavailable");
  });
  killShellProcess(child, "SIGKILL", "linux");
  expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  processKill.mockRestore();
  killShellProcess({ kill: child.kill }, "SIGTERM", "linux");
  expect(child.kill).toHaveBeenLastCalledWith("SIGTERM");
});

test("uses taskkill options on Windows and falls back after failure", () => {
  const child = { pid: 7, kill: jest.fn() };
  killShellProcess(child, "SIGKILL", "win32");
  expect(spawn).toHaveBeenCalledWith(
    "taskkill",
    ["/PID", "7", "/T", "/F"],
    expect.objectContaining({ windowsHide: true, stdio: "ignore" }),
  );
  killers[0].emit("error", new Error("missing taskkill"));
  expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  child.kill.mockClear();
  killShellProcess(child, "SIGTERM", "win32");
  killers[1].emit("close", 0);
  expect(child.kill).not.toHaveBeenCalled();
  killShellProcess(child, "SIGTERM", "win32");
  killers[2].emit("close", 1);
  expect(child.kill).toHaveBeenCalledWith("SIGTERM");
});
