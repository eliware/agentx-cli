import { expect, test } from "@jest/globals";
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
