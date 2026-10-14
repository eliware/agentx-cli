import { chmod, mkdir } from "node:fs/promises";
import { workerDirectory, workerStateDirectory } from "./worker-paths.mjs";

async function secureDirectory(directory, platform = process.platform) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (platform !== "win32") await chmod(directory, 0o700);
}

export async function ensureWorkerStorage(cwd) {
  const root = workerStateDirectory();
  await secureDirectory(root);
  await secureDirectory(`${root}/workers`);
  await secureDirectory(workerDirectory(cwd));
}

export const workerStorageDirectoryInternals = { secureDirectory };
