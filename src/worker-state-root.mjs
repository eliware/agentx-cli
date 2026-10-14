import { homedir } from "node:os";
import { join } from "node:path";

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
