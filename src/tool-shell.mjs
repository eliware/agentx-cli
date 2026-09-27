import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { MAX_TOOL_OUTPUT } from "./tool-output.mjs";
import { getShellLaunchers, isMissingLauncherError } from "./platform.mjs";

const DEFAULT_TIMEOUT_MS = 30_000;
const OUTPUT_TRUNCATION_NOTE = "\n[output truncated]";
const TERMINATION_GRACE_MS = 250;

function killChildProcess(child, signal = "SIGTERM", platform = process.platform) {
  if (platform !== "win32" && child?.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {}
  }
  if (platform === "win32" && child?.pid) {
    const force = signal === "SIGKILL" ? "/F" : "";
    const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", ...(force ? [force] : [])], {
      windowsHide: true,
      stdio: "ignore",
    });
    killer.once("error", () => child.kill(signal));
    killer.once("close", (code) => {
      if (code !== 0) child.kill(signal);
    });
    return;
  }
  child?.kill(signal);
}

function normalizeLimit(value, fallback = MAX_TOOL_OUTPUT) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function truncateText(text, limit) {
  const string = String(text ?? "");
  const max = normalizeLimit(limit);
  if (string.length <= max) return string;
  if (max <= OUTPUT_TRUNCATION_NOTE.length) return string.slice(0, max);
  return `${string.slice(0, max - OUTPUT_TRUNCATION_NOTE.length)}${OUTPUT_TRUNCATION_NOTE}`;
}

function makeShellCommandOutput({ stdout = "", stderr = "", outcome, maxOutputLength }) {
  return {
    stdout: truncateText(stdout, maxOutputLength),
    stderr: truncateText(stderr, maxOutputLength),
    outcome,
  };
}

export function normalizeTerminationOutcome({
  interrupted = false,
  timedOut = false,
  signal = null,
  code = null,
} = {}) {
  if (interrupted || timedOut) return { type: "timeout" };
  if (signal) return { type: "exit", exit_code: 1 };
  return { type: "exit", exit_code: Number.isFinite(code) ? Number(code) : 1 };
}

function getLaunchPlan(command, platform = process.platform) {
  return getShellLaunchers(platform).map((launcher) => ({
    file: launcher.file,
    args: [...launcher.args, command],
  }));
}

function runLauncherCommand(
  plan,
  command,
  cwd,
  {
    timeoutMs,
    maxOutputLength,
    writeStdout,
    writeStderr,
    signal,
    platform = process.platform,
  } = {},
) {
  if (!String(command ?? "").trim())
    return Promise.resolve(
      makeShellCommandOutput({
        stderr: "Unable to execute an empty shell command",
        outcome: { type: "exit", exit_code: 2 },
        maxOutputLength,
      }),
    );
  if (!cwd || typeof cwd !== "string")
    return Promise.resolve(
      makeShellCommandOutput({
        stderr: "Unable to execute shell command without a working directory",
        outcome: { type: "exit", exit_code: 2 },
        maxOutputLength,
      }),
    );
  return new Promise((resolve, reject) => {
    const child = spawn(plan.file, plan.args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: platform !== "win32",
    });

    const stdoutDecoder = new StringDecoder("utf8");
    const stderrDecoder = new StringDecoder("utf8");
    let stdout = "";
    let stderr = "";
    let finished = false;
    let timedOut = false;
    let interrupted = false;
    let timer = null;
    let terminationTimer = null;
    let terminationRequested = false;
    let onAbort = null;

    const finalizeChunk = (chunk, channel) => {
      if (!chunk) return;
      if (channel === "stdout") {
        stdout = truncateText(`${stdout}${chunk}`, maxOutputLength);
        writeStdout?.(chunk);
      } else {
        stderr = truncateText(`${stderr}${chunk}`, maxOutputLength);
        writeStderr?.(chunk);
      }
    };

    const flushStream = (channel) => {
      const decoder = channel === "stdout" ? stdoutDecoder : stderrDecoder;
      const chunk = decoder.end();
      finalizeChunk(chunk, channel);
    };

    const done = (result) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      if (terminationTimer) clearTimeout(terminationTimer);
      signal?.removeEventListener?.("abort", onAbort);
      resolve(result);
    };

    child.on("error", (error) => {
      if (finished) return;
      if (timer) clearTimeout(timer);
      if (isMissingLauncherError(error)) {
        reject(error);
        return;
      }
      const message = error?.message || "Unable to execute shell command";
      done(
        makeShellCommandOutput({
          stdout,
          stderr: stderr || message,
          outcome: { type: "exit", exit_code: 1 },
          maxOutputLength,
        }),
      );
    });

    child.stdout?.on("data", (chunk) => {
      finalizeChunk(stdoutDecoder.write(chunk), "stdout");
    });

    child.stderr?.on("data", (chunk) => {
      finalizeChunk(stderrDecoder.write(chunk), "stderr");
    });

    child.on("close", (code, signal) => {
      flushStream("stdout");
      flushStream("stderr");
      const outcome = normalizeTerminationOutcome({ interrupted, timedOut, signal, code });
      done(makeShellCommandOutput({ stdout, stderr, outcome, maxOutputLength }));
    });

    const terminate = () => {
      if (terminationRequested || finished) return;
      terminationRequested = true;
      killChildProcess(child, "SIGTERM", platform);
      terminationTimer = setTimeout(() => {
        if (!finished) killChildProcess(child, "SIGKILL", platform);
      }, TERMINATION_GRACE_MS);
    };
    const timeout =
      timeoutMs === null
        ? 0
        : Number.isFinite(timeoutMs) && timeoutMs > 0
          ? timeoutMs
          : DEFAULT_TIMEOUT_MS;
    if (timeout > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        terminate();
      }, timeout);
    }
    onAbort = () => {
      if (finished) return;
      interrupted = true;
      terminate();
    };
    if (signal?.aborted) onAbort();
    else signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

export async function executeShellCommand(
  command,
  cwd,
  {
    timeoutMs,
    maxOutputLength,
    platform = process.platform,
    writeStdout,
    writeStderr,
    signal,
  } = {},
) {
  let lastError = null;
  for (const plan of getLaunchPlan(command, platform)) {
    try {
      return await runLauncherCommand(plan, command, cwd, {
        timeoutMs,
        maxOutputLength,
        writeStdout,
        writeStderr,
        signal,
        platform,
      });
    } catch (error) {
      lastError = error;
      if (isMissingLauncherError(error)) continue;
      const stderr = error?.message || "Unable to execute shell command";
      return makeShellCommandOutput({
        stdout: "",
        stderr,
        outcome: { type: "exit", exit_code: 1 },
        maxOutputLength,
      });
    }
  }

  const stderr = lastError?.message || "Unable to locate a supported shell launcher";
  return makeShellCommandOutput({
    stdout: "",
    stderr,
    outcome: { type: "exit", exit_code: 1 },
    maxOutputLength,
  });
}

export async function shellExec(command, cwd, { signal } = {}) {
  const result = await executeShellCommand(command, cwd, {
    timeoutMs: null,
    signal,
    maxOutputLength: MAX_TOOL_OUTPUT,
    writeStdout: (chunk) => process.stdout.write(chunk),
    writeStderr: (chunk) => process.stderr.write(chunk),
  });
  return result;
}

export { getShellLaunchers };
