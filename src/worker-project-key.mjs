import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

function canonicalCwd(cwd) {
  const absolute = resolve(cwd);
  try {
    return realpathSync.native(absolute);
  } catch {
    return absolute;
  }
}

export function workerProjectKey(cwd, platform = process.platform) {
  const canonicalPath = canonicalCwd(cwd);
  const canonical = platform === "win32" ? canonicalPath.toLowerCase() : canonicalPath;
  return createHash("sha256").update(canonical).digest("hex");
}
