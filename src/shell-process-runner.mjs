import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { isMissingLauncherError } from "./platform.mjs";
import {
  makeShellCommandOutput,
  truncateShellText,
  validateShellRequest,
} from "./shell-output.mjs";
import { normalizeTerminationOutcome } from "./shell-termination.mjs";
import { attachShellProcessEvents } from "./shell-process-events.mjs";
import { startShellTermination } from "./shell-process-termination.mjs";
import { createShellSpawnOptions } from "./shell-process-options.mjs";

export function runShellProcess(plan, command, cwd, options) {
  const { timeoutMs, maxOutputLength, writeStdout, writeStderr, signal, platform } = options;
  const validation = validateShellRequest(command, cwd, maxOutputLength);
  if (validation) return Promise.resolve(validation);
  return new Promise((resolve, reject) => {
    const child = spawn(plan.file, plan.args, createShellSpawnOptions(cwd, platform));
    const stdoutDecoder = new StringDecoder("utf8");
    const stderrDecoder = new StringDecoder("utf8");
    let stdout = "";
    let stderr = "";
    let finished = false;
    let timedOut = false;
    let interrupted = false;
    let cleanupTermination;
    const finalizeChunk = (chunk, channel) => {
      if (!chunk) return;
      if (channel === "stdout") {
        stdout = truncateShellText(`${stdout}${chunk}`, maxOutputLength);
        writeStdout?.(chunk);
      } else {
        stderr = truncateShellText(`${stderr}${chunk}`, maxOutputLength);
        writeStderr?.(chunk);
      }
    };
    const flushStream = (channel) =>
      finalizeChunk((channel === "stdout" ? stdoutDecoder : stderrDecoder).end(), channel);
    const done = (result) => {
      if (finished) return;
      finished = true;
      cleanupTermination?.();
      resolve(result);
    };
    attachShellProcessEvents(child, {
      error: (error) => {
        if (finished) return;
        cleanupTermination?.();
        if (isMissingLauncherError(error)) {
          reject(error);
          return;
        }
        done(
          makeShellCommandOutput({
            stdout,
            stderr: stderr || error?.message || "Unable to execute shell command",
            outcome: { type: "exit", exit_code: 1 },
            maxOutputLength,
          }),
        );
      },
      stdout: (chunk) => finalizeChunk(stdoutDecoder.write(chunk), "stdout"),
      stderr: (chunk) => finalizeChunk(stderrDecoder.write(chunk), "stderr"),
      close: (code, childSignal) => {
        flushStream("stdout");
        flushStream("stderr");
        done(
          makeShellCommandOutput({
            stdout,
            stderr,
            outcome: normalizeTerminationOutcome({
              interrupted,
              timedOut,
              signal: childSignal,
              code,
            }),
            maxOutputLength,
          }),
        );
      },
    });
    cleanupTermination = startShellTermination({
      child,
      timeoutMs,
      signal,
      platform,
      onTimeout: () => {
        timedOut = true;
      },
      onInterrupt: () => {
        interrupted = true;
      },
      shouldTerminate: () => !finished,
    });
  });
}
