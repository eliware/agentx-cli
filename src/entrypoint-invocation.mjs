import { realpathSync, existsSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function isDirectInvocation(moduleUrl = import.meta.url) {
  if (!process.argv[1]) return false;
  if (!existsSync(process.argv[1])) return false;
  const realPath = realpathSync(process.argv[1]);
  if (pathToFileURL(realPath).href === moduleUrl) return true;
  const modulePath = fileURLToPath(moduleUrl);
  const moduleDirectory = dirname(modulePath);
  const launchers = [
    resolve(moduleDirectory, "bin", basename(modulePath)),
    resolve(moduleDirectory, "..", "bin", "agentx.mjs"),
  ];
  return launchers.some(
    (launcherPath) => existsSync(launcherPath) && realpathSync(launcherPath) === realPath,
  );
}
