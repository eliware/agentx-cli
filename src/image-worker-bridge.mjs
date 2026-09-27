import { spawn } from "node:child_process";
import { path } from "@eliware/common";

const imageBranchQueues = new Map();

export async function runImageInspectionProcess(args, options = {}) {
  const key = `${options?.cwd || ""}:${options?.previousResponseId || options?.responseId || ""}`;
  const prior = imageBranchQueues.get(key) || Promise.resolve();
  const current = prior.catch(() => {}).then(() => runQueuedImageInspectionProcess(args, options));
  const tracked = current.finally(() => {
    if (imageBranchQueues.get(key) === tracked) imageBranchQueues.delete(key);
  });
  imageBranchQueues.set(key, tracked);
  return current;
}

function runQueuedImageInspectionProcess(
  args,
  { cwd, responseId, previousResponseId, model, onUsage },
) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path(import.meta, "./image-worker.mjs")], {
      cwd,
      env: {
        ...process.env,
        AGENTX_IMAGE_REQUEST: JSON.stringify({ args, cwd, responseId, previousResponseId, model }),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
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
