import { executeImageBranch } from "./image-branch.mjs";
import { runImageInspectionProcess } from "./image-worker-bridge.mjs";
import {
  MAX_IMAGES,
  MAX_PROMPT_LENGTH,
  prepareImageInspectionRequest,
} from "./image-inspection-request.mjs";

export async function inspectImage(openai, args, options = {}) {
  if (options.processWorker) return await runImageInspectionProcess(args, options);
  return await runImageInspection(openai, args, options);
}

export async function runImageInspection(
  openai,
  args,
  { cwd, responseId, previousResponseId, callerResponse, model, onUsage } = {},
) {
  try {
    const request = await prepareImageInspectionRequest(args, {
      cwd,
      responseId,
      previousResponseId,
      callerResponse,
      model,
    });
    if (typeof request === "string") return request;
    return await executeImageBranch(openai, request, { cwd, onUsage });
  } catch (error) {
    return `ERROR: ${error?.message || String(error)}`;
  }
}

export { MAX_IMAGES, MAX_PROMPT_LENGTH };
