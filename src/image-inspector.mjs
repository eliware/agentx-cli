import { runImageInspectionProcess } from "./image-worker-bridge.mjs";
import { MAX_IMAGES, MAX_PROMPT_LENGTH, runImageInspection } from "./image-direct-inspection.mjs";

export async function inspectImage(openai, args, options = {}) {
  if (options.processWorker) return await runImageInspectionProcess(args, options);
  return await runImageInspection(openai, args, options);
}

export { MAX_IMAGES, MAX_PROMPT_LENGTH };
