import { describe, expect, test } from "@jest/globals";
import { accessSync } from "node:fs";
import {
  executeShellCommand,
  getShellLaunchers,
  normalizeTerminationOutcome,
  shellExec,
} from "../src/tool-shell.mjs";
import { cleanupTempDir, makeTempDir } from "./test-helpers.mjs";

describe("shell process execution", () => {
  test("exposes Windows launcher order and normalizes exit outcomes", () => {
    expect(getShellLaunchers("win32").map((item) => item.file)).toEqual([
      "pwsh",
      "powershell.exe",
      "cmd.exe",
    ]);
    expect(normalizeTerminationOutcome({ timedOut: true, code: 1 })).toEqual({ type: "timeout" });
    expect(normalizeTerminationOutcome({ interrupted: true, code: 1 })).toEqual({
      type: "timeout",
    });
    expect(normalizeTerminationOutcome({ signal: "SIGTERM", code: null })).toEqual({
      type: "exit",
      exit_code: 1,
    });
    expect(normalizeTerminationOutcome({ code: 7 })).toEqual({ type: "exit", exit_code: 7 });
    expect(normalizeTerminationOutcome({ code: null })).toEqual({ type: "exit", exit_code: 1 });
    expect(normalizeTerminationOutcome()).toEqual({ type: "exit", exit_code: 1 });
  });

  test("rejects empty commands and missing working directories before spawning", async () => {
    await expect(executeShellCommand("   ", process.cwd())).resolves.toMatchObject({
      stderr: "Unable to execute an empty shell command",
      outcome: { exit_code: 2 },
    });
    await expect(executeShellCommand(undefined, process.cwd())).resolves.toMatchObject({
      stderr: "Unable to execute an empty shell command",
      outcome: { exit_code: 2 },
    });
    await expect(executeShellCommand("echo nope", null)).resolves.toMatchObject({
      stderr: "Unable to execute shell command without a working directory",
      outcome: { exit_code: 2 },
    });
  });

  test("reports when no supported shell launcher is available", async () => {
    await expect(
      executeShellCommand("echo test", process.cwd(), { getLaunchers: () => [] }),
    ).resolves.toMatchObject({
      stderr: "Unable to locate a supported shell launcher",
      outcome: { type: "exit", exit_code: 1 },
    });
  });

  test("captures process output and reports a clean exit", async () => {
    const directory = makeTempDir("agentx-shell-process-");
    try {
      await expect(
        executeShellCommand("node -e " + JSON.stringify("process.stdout.write('ok')"), directory),
      ).resolves.toMatchObject({
        stdout: "ok",
        stderr: "",
        outcome: { type: "exit", exit_code: 0 },
      });
    } finally {
      cleanupTempDir(directory);
    }
  });

  test("escalates termination for timeouts and abort signals", async () => {
    if (process.platform === "win32") return;
    const directory = makeTempDir("agentx-shell-timeout-");
    const controller = new AbortController();
    try {
      const timed = await executeShellCommand(
        `node -e "process.on('SIGTERM', () => {}); setTimeout(() => {}, 5000)"`,
        directory,
        { timeoutMs: 25 },
      );
      expect(timed.outcome).toEqual({ type: "timeout" });
      const abortedPromise = executeShellCommand(
        'node -e "setTimeout(() => {}, 1000)"',
        directory,
        {
          signal: controller.signal,
        },
      );
      setTimeout(() => controller.abort(), 25);
      await expect(abortedPromise).resolves.toMatchObject({ outcome: { type: "timeout" } });
    } finally {
      cleanupTempDir(directory);
    }
  });

  test("terminates descendants with the timed-out process group", async () => {
    if (process.platform === "win32") return;
    const directory = makeTempDir("agentx-shell-descendant-");
    try {
      const marker = `${directory}/descendant-ran`;
      const childScript = `const fs=require('fs'); setTimeout(()=>fs.writeFileSync(${JSON.stringify(marker)},'bad'),1000)`;
      const parentScript = `const cp=require('child_process'); cp.spawn(process.execPath,['-e',${JSON.stringify(childScript)}],{stdio:'ignore'}); setTimeout(()=>{},5000)`;
      const result = await executeShellCommand(
        `node -e ${JSON.stringify(parentScript)}`,
        directory,
        {
          timeoutMs: 250,
        },
      );
      await new Promise((resolve) => setTimeout(resolve, 1200));
      expect(result.outcome).toEqual({ type: "timeout" });
      expect(() => accessSync(marker)).toThrow();
    } finally {
      cleanupTempDir(directory);
    }
  });

  test("streams interactive shell output and returns captured output", async () => {
    if (process.platform === "win32") return;
    const directory = makeTempDir("agentx-shell-stream-");
    const oldOut = process.stdout.write;
    const oldErr = process.stderr.write;
    const stdout = [];
    const stderr = [];
    process.stdout.write = (chunk) => (stdout.push(String(chunk)), true);
    process.stderr.write = (chunk) => (stderr.push(String(chunk)), true);
    try {
      await expect(
        shellExec(
          "node -e " +
            JSON.stringify("process.stdout.write('hello'); process.stderr.write('oops')"),
          directory,
        ),
      ).resolves.toMatchObject({ stdout: "hello", stderr: "oops", outcome: { exit_code: 0 } });
      expect(stdout.join("")).toContain("hello");
      expect(stderr.join("")).toContain("oops");
    } finally {
      process.stdout.write = oldOut;
      process.stderr.write = oldErr;
      cleanupTempDir(directory);
    }
  });
});
