import { expect, test } from "@jest/globals";
import {
  legacyWorkerDirectory,
  workerDirectory,
  workerLogPath,
  workerRecordPath,
} from "../src/worker-paths.mjs";

test("builds current and legacy worker paths", () => {
  expect(workerDirectory("/tmp/project", "linux", "/state")).toMatch(/workers[\\/][a-f0-9]{64}$/);
  expect(workerRecordPath("/tmp/project", "agent-1")).toContain("agent-1.json");
  expect(workerLogPath("/tmp/project", "agent-1")).toContain("agent-1.log");
  expect(legacyWorkerDirectory("/tmp/project")).toContain(".agentx");
});

test("rejects unsafe worker IDs before building file paths", () => {
  expect(() => workerRecordPath("/repo", "../outside")).toThrow("Invalid worker ID");
});
