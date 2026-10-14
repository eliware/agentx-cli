import { executeImageBranch } from "./image-branch.mjs";
import {
  MAX_IMAGES,
  MAX_PROMPT_LENGTH,
  prepareImageInspectionRequest,
} from "./image-inspection-request.mjs";

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
