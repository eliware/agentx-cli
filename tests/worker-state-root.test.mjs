import { expect, test } from "@jest/globals";
import { join } from "node:path";
import { workerStateDirectory } from "../src/worker-state-root.mjs";

test("selects Windows state roots from local app data or home", () => {
  expect(workerStateDirectory({ LOCALAPPDATA: "C:/Local" }, "win32", "C:/Home")).toBe(
    join("C:/Local", "AgentX", "State"),
  );
  expect(workerStateDirectory({ XDG_STATE_HOME: "C:/XDG" }, "win32", "C:/Home")).toBe(
    join("C:/XDG", "AgentX", "State"),
  );
  expect(workerStateDirectory({}, "win32", "C:/Home")).toBe(
    join("C:/Home", "AppData", "Local", "AgentX", "State"),
  );
});

test("selects macOS and Linux state roots", () => {
  expect(workerStateDirectory({ XDG_STATE_HOME: "/state" }, "darwin", "/home")).toBe(
    join("/state", "AgentX", "State"),
  );
  expect(workerStateDirectory({}, "darwin", "/home")).toBe(
    join("/home", "Library", "Application Support", "AgentX", "State"),
  );
  expect(workerStateDirectory({}, "linux", "/home")).toBe(
    join("/home", ".local", "state", "agentx"),
  );
});
