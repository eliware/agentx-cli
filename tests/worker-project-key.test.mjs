import { expect, test } from "@jest/globals";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { workerProjectKey } from "../src/worker-project-key.mjs";

test("hashes resolved project paths", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "agentx-project-key-"));
  try {
    expect(workerProjectKey(directory)).toMatch(/^[a-f0-9]{64}$/);
    expect(workerProjectKey(directory)).toBe(workerProjectKey(directory));
    expect(workerProjectKey(path.join(directory, "missing"))).toMatch(/^[a-f0-9]{64}$/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("matches Windows project paths without case differences", () => {
  expect(workerProjectKey("C:/Repo", "win32")).toBe(workerProjectKey("c:/repo", "win32"));
});
