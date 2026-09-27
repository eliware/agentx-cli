import path from "node:path";
import { fs } from "@eliware/common";
import { deleteOptional } from "./runtime.mjs";

const ONESHOT_PREFIX = ".agentx_responseid.oneshot-";
const STALE_ONESHOT_AGE_MS = 60 * 60 * 1000;

export async function cleanupStaleOneShotStates(directory, now = Date.now()) {
  let entries;
  try {
    entries = await fs.promises.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return 0;
    throw error;
  }
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith(ONESHOT_PREFIX)) continue;
    const filePath = path.join(directory, entry.name);
    let stat;
    try {
      stat = await fs.promises.stat(filePath);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    if (now - stat.mtimeMs < STALE_ONESHOT_AGE_MS) continue;
    await deleteOptional(filePath);
    removed += 1;
  }
  return removed;
}
