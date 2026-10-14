import { spawn } from "node:child_process";
import { createImageWorkerLaunch } from "./image-worker-request.mjs";

export function runImageInspectionProcess(
  args,
  { cwd, responseId, previousResponseId, model } = {},
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
    child.on("error", (error) => resolve({ error }));
    child.on("close", (code) => {
      resolve({ stdout, stderr, code });
    });
  });
}
