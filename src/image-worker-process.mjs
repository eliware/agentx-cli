import { spawn } from "node:child_process";
import { path } from "@eliware/common";

export function runImageInspectionProcess(
  args,
  { cwd, responseId, previousResponseId, model, onUsage } = {},
) {
  return new Promise((resolve) => {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        ["path", "systemroot", "windir", "temp", "tmp"].includes(key.toLowerCase()),
      ),
    );
    if (process.env.agentx_api_key) env.agentx_api_key = process.env.agentx_api_key;
    if (process.env.AGENTX_API_KEY) env.AGENTX_API_KEY = process.env.AGENTX_API_KEY;
    env.AGENTX_IMAGE_REQUEST = JSON.stringify({ args, cwd, responseId, previousResponseId, model });
    const child = spawn(process.execPath, [path(import.meta, "./image-worker.mjs")], {
      cwd,
      env,
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
