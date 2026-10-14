import { spawn } from "node:child_process";
import { createImageWorkerLaunch } from "./image-worker-request.mjs";

export function runImageInspectionProcess(
  args,
  { cwd, responseId, previousResponseId, model, onUsage } = {},
) {
  return new Promise((resolve) => {
    const launch = createImageWorkerLaunch(args, { cwd, responseId, previousResponseId, model });
    const child = spawn(launch.command, launch.args, launch.options);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => resolve(`ERROR: ${error.message}`));
    child.on("close", (code) => {
      let result;
      try {
        result = JSON.parse(stdout);
        if (result.usage) onUsage?.(result.usage);
      } catch {
        resolve(
          `ERROR: ${code !== 0 ? stderr.trim() || `image worker exited with code ${code}` : `invalid image worker response${stderr.trim() ? `: ${stderr.trim()}` : ""}`}`,
        );
        return;
      }
      if (code !== 0) {
        resolve(
          `ERROR: ${stderr.trim() || result.error || `image worker exited with code ${code}`}`,
        );
        return;
      }
      resolve(result.text || result.error || "The image inspection returned no text.");
    });
  });
}
