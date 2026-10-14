import { prepareImageInspectionContent } from "./image-inspection-content.mjs";
import {
  MAX_IMAGES,
  MAX_PROMPT_LENGTH,
  validateImageInspectionArgs,
} from "./image-inspection-validation.mjs";
import { selectImageInspectionParent } from "./image-inspection-parent.mjs";

export async function prepareImageInspectionRequest(args, options = {}) {
  const validation = validateImageInspectionArgs(args);
  if (validation.error) return validation.error;
  const { prompt, images } = validation;
  const { cwd, responseId, previousResponseId, callerResponse, model } = options;
  const content = [
    { type: "input_text", text: prompt },
    ...(await prepareImageInspectionContent(images, { cwd, detail: args?.detail || "low" })),
  ];
  const parent = selectImageInspectionParent({ previousResponseId, callerResponse, responseId });
  return {
    model,
    input: [{ role: "user", content }],
    ...(parent ? { previous_response_id: parent } : {}),
    store: true,
    tools: [{ type: "shell", environment: { type: "local" } }, { type: "image_generation" }],
  };
}

export { MAX_IMAGES, MAX_PROMPT_LENGTH };
