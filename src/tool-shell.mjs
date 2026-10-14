import { MAX_TOOL_OUTPUT } from "./tool-output.mjs";
import { getShellLaunchers, isMissingLauncherError } from "./platform.mjs";
import { makeShellCommandOutput } from "./shell-output.mjs";
import { runShellProcess } from "./shell-process-runner.mjs";
function getLaunchPlan(command, platform, getLaunchers) {
  return getLaunchers(platform).map((launcher) => ({
    file: launcher.file,
    args: [...launcher.args, command],
  }));
}

export async function executeShellCommand(
  command,
  cwd,
  {
    timeoutMs,
    maxOutputLength,
    platform = process.platform,
    getLaunchers = getShellLaunchers,
    writeStdout,
    writeStderr,
    signal,
  } = {},
) {
  let lastError = null;
  for (const plan of getLaunchPlan(command, platform, getLaunchers)) {
    try {
      return await runShellProcess(plan, command, cwd, {
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
