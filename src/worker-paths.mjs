import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { realpathSync } from "node:fs";

const WORKER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function workerStateDirectory(
  env = process.env,
  platform = process.platform,
  home = homedir(),
) {
  if (platform === "win32")
    return join(
      env.LOCALAPPDATA || env.XDG_STATE_HOME || join(home, "AppData", "Local"),
      "AgentX",
      "State",
    );
  if (platform === "darwin")
    return join(
      env.XDG_STATE_HOME || join(home, "Library", "Application Support"),
      "AgentX",
      "State",
    );
  return join(env.XDG_STATE_HOME || join(home, ".local", "state"), "agentx");
}

function canonicalCwd(cwd) {
  const absolute = resolve(cwd);
  try {
    return realpathSync.native(absolute);
  } catch {
    return absolute;
  }
}

export function workerDirectory(cwd, platform = process.platform, root = workerStateDirectory()) {
  const canonicalPath = canonicalCwd(cwd);
  const canonical = platform === "win32" ? canonicalPath.toLowerCase() : canonicalPath;
  const key = createHash("sha256").update(canonical).digest("hex");
  return join(root, "workers", key);
}

export function legacyWorkerDirectory(cwd) {
  return join(cwd, ".agentx", "workers");
}

export function workerFilePath(directory, id, suffix) {
  if (!WORKER_ID_PATTERN.test(String(id))) throw new Error("Invalid worker ID");
  return join(directory, `${id}${suffix}`);
}

export function workerRecordPath(cwd, id) {
  return workerFilePath(workerDirectory(cwd), id, ".json");
}

export function workerLogPath(cwd, id) {
  return workerFilePath(workerDirectory(cwd), id, ".log");
}

export const workerPathInternals = { canonicalCwd, WORKER_ID_PATTERN };
