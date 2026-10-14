import { describe, expect, jest, test } from "@jest/globals";
import { accessSync } from "node:fs";
import { cleanupTempDir, makeTempDir } from "../test-fixtures/test-helpers.mjs";

await jest.unstable_unmockModule("node:child_process");
const { executeShellCommand, shellExec } = await import("../src/tool-shell.mjs");

describe("shell process execution", () => {
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

  test("retries missing launchers and writes interactive output", async () => {
    const missing = Object.assign(new Error("not found"), { code: "ENOENT" });
    const runShellProcess = jest
      .fn()
      .mockRejectedValueOnce(missing)
      .mockImplementationOnce(async (_plan, _command, _cwd, options) => {
        options.writeStdout?.("live out");
        options.writeStderr?.("live err");
        return { stdout: "live out", stderr: "live err" };
      })
      .mockRejectedValueOnce(new TypeError("bad launcher"))
      .mockRejectedValueOnce(new Error(""))
      .mockImplementation(async (_plan, _command, _cwd, options) => {
        options.writeStdout?.("live out");
        options.writeStderr?.("live err");
        return { stdout: "live out", stderr: "live err" };
      });
    const output = [];
    const error = [];
    const oldOut = process.stdout.write;
    const oldErr = process.stderr.write;
    process.stdout.write = (chunk) => (output.push(String(chunk)), true);
    process.stderr.write = (chunk) => (error.push(String(chunk)), true);
    try {
      await jest.isolateModulesAsync(async () => {
        await jest.unstable_mockModule("../src/shell-process-runner.mjs", () => ({
          runShellProcess,
        }));
        const isolated = await import("../src/tool-shell.mjs");
        await expect(
          isolated.executeShellCommand("echo", "/repo", {
            platform: "linux",
            getLaunchers: () => [
              { file: "first", args: [] },
              { file: "second", args: [] },
            ],
          }),
        ).resolves.toMatchObject({ stdout: "live out" });
        await expect(
          isolated.executeShellCommand("echo", "/repo", {
            platform: "linux",
            getLaunchers: () => [{ file: "broken", args: [] }],
          }),
        ).resolves.toMatchObject({ stderr: "bad launcher", outcome: { exit_code: 1 } });
        await expect(
          isolated.executeShellCommand("echo", "/repo", {
            platform: "linux",
            getLaunchers: () => [{ file: "broken", args: [] }],
          }),
        ).resolves.toMatchObject({ stderr: "Unable to execute shell command" });
        await isolated.shellExec("echo", "/repo");
      });
      expect(output.join("")).toContain("live out");
      expect(error.join("")).toContain("live err");
    } finally {
      process.stdout.write = oldOut;
      process.stderr.write = oldErr;
    }
  });
});
