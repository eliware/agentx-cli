import { spawn } from "node:child_process";

export function killShellProcess(child, signal, platform) {
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
