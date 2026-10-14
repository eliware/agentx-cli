export function workerLaunchArgs(entrypointPath, task, debug = false) {
  return [entrypointPath, ...(debug ? ["--debug"] : []), "--", task];
}
