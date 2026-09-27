import { shellExec } from "../tool-shell.mjs";

export async function executeLocalShellCommand({
  command,
  cwd,
  input,
  readline,
  preserveHistory = () => {},
  replaceReadline = () => {},
  execute = shellExec,
  reportInterruption = () => {},
}) {
  const controller = new AbortController();
  const interactive =
    input?.isTTY && typeof input?.setRawMode === "function" && typeof input?.on === "function";
  let interrupted = false;
  const onInput = (chunk) => {
    if (!String(chunk).includes("\x03")) return;
    interrupted = true;
    controller.abort();
  };

  if (interactive) {
    preserveHistory();
    readline?.close?.();
    input.setRawMode(true);
    input.on("data", onInput);
    input.resume?.();
  }
  try {
    const result = await execute(command, cwd, { signal: controller.signal });
    if (interrupted) reportInterruption();
    return result;
  } finally {
    if (interactive) {
      input.removeListener?.("data", onInput);
      input.setRawMode(false);
      replaceReadline();
    }
  }
}
