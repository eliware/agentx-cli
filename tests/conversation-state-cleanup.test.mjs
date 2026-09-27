import { describe, expect, jest as testMocks, test } from "@jest/globals";
import { fs as commonFs } from "@eliware/common";
import { existsSync, mkdirSync, utimesSync } from "node:fs";
import { cleanupStaleOneShotStates } from "../src/conversation-state-cleanup.mjs";
import { cleanupTempDir, makeFile, makeTempDir } from "./test-helpers.mjs";

describe("stale one-shot state cleanup", () => {
  test("removes stale state files but preserves recent files and directories", async () => {
    const tmp = makeTempDir("agentx-state-cleanup-");
    try {
      const stale = makeFile(tmp, ".agentx_responseid.oneshot-old", "old");
      const recent = makeFile(tmp, ".agentx_responseid.oneshot-new", "new");
      mkdirSync(`${tmp}/.agentx_responseid.oneshot-directory`);
      const now = Date.now();
      utimesSync(stale, new Date(now - 2 * 60 * 60 * 1000), new Date(now - 2 * 60 * 60 * 1000));
      expect(await cleanupStaleOneShotStates(tmp, now)).toBe(1);
      expect(existsSync(stale)).toBe(false);
      expect(existsSync(recent)).toBe(true);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test("ignores a missing directory and propagates other readdir errors", async () => {
    const tmp = makeTempDir("agentx-state-missing-");
    const file = makeFile(tmp, "not-a-directory", "x");
    try {
      await expect(cleanupStaleOneShotStates(`${tmp}/missing`)).resolves.toBe(0);
      await expect(cleanupStaleOneShotStates(file)).rejects.toBeTruthy();
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test("ignores one-shot files removed before stat completes", async () => {
    const tmp = makeTempDir("agentx-state-race-");
    const originalStat = commonFs.promises.stat;
    try {
      makeFile(tmp, ".agentx_responseid.oneshot-race", "old");
      commonFs.promises.stat = testMocks
        .fn()
        .mockRejectedValue(Object.assign(new Error("gone"), { code: "ENOENT" }));
      await expect(cleanupStaleOneShotStates(tmp)).resolves.toBe(0);
    } finally {
      commonFs.promises.stat = originalStat;
      cleanupTempDir(tmp);
    }
  });

  test("propagates non-missing stat failures", async () => {
    const tmp = makeTempDir("agentx-state-stat-error-");
    const originalStat = commonFs.promises.stat;
    try {
      makeFile(tmp, ".agentx_responseid.oneshot-error", "old");
      commonFs.promises.stat = testMocks
        .fn()
        .mockRejectedValue(Object.assign(new Error("denied"), { code: "EACCES" }));
      await expect(cleanupStaleOneShotStates(tmp)).rejects.toMatchObject({ code: "EACCES" });
    } finally {
      commonFs.promises.stat = originalStat;
      cleanupTempDir(tmp);
    }
  });
});
