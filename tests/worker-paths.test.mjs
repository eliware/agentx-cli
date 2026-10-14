import { expect, test } from "@jest/globals";
import { join } from "node:path";
import {
  workerDirectory,
  workerLogPath,
  workerRecordPath,
  workerStateDirectory,
} from "../src/worker-paths.mjs";

test("builds isolated worker paths", () => {
  expect(workerStateDirectory({}, "linux", "/workspace/test")).toContain("agentx");
  expect(workerDirectory("/tmp/project", "linux", "/state")).toContain("workers");
  expect(workerRecordPath("/tmp/project", "agent-1")).toContain("agent-1.json");
  expect(workerLogPath("/tmp/project", "agent-1")).toContain("agent-1.log");
});

test("selects platform state roots and canonical project paths", () => {
  expect(workerStateDirectory({ LOCALAPPDATA: "C:/Local" }, "win32", "C:/Home")).toBe(
    join("C:/Local", "AgentX", "State"),
  );
  expect(workerStateDirectory({ XDG_STATE_HOME: "/state" }, "darwin", "/home")).toBe(
    join("/state", "AgentX", "State"),
  );
  expect(workerStateDirectory({}, "darwin", "/home")).toBe(
    join("/home", "Library", "Application Support", "AgentX", "State"),
  );
  expect(workerStateDirectory({ XDG_STATE_HOME: "C:/XDG" }, "win32", "C:/Home")).toBe(
    join("C:/XDG", "AgentX", "State"),
  );
  expect(workerStateDirectory({}, "win32", "C:/Home")).toBe(
    join("C:/Home", "AppData", "Local", "AgentX", "State"),
  );
  expect(workerDirectory("C:/Repo", "win32", "/state")).toBe(
    workerDirectory("c:/repo", "win32", "/state"),
  );
  expect(workerDirectory("/missing/project", "linux", "/state")).toContain("workers");
  expect(() => workerRecordPath("/repo", "../outside")).toThrow("Invalid worker ID");
});
