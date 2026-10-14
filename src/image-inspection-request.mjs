import { prepareImageInspectionContent } from "./image-inspection-content.mjs";

export const MAX_IMAGES = 10;
export const MAX_PROMPT_LENGTH = 10_000;

export async function prepareImageInspectionRequest(args, options = {}) {
  const prompt = String(args?.prompt ?? "").trim();
  if (!prompt) return "ERROR: image prompt is required";
  if (prompt.length > MAX_PROMPT_LENGTH)
    return `ERROR: image prompt exceeds the ${MAX_PROMPT_LENGTH} character limit`;
  const images = Array.isArray(args?.images) ? args.images : [];
  if (!images.length) return "ERROR: at least one image is required";
  if (images.length > MAX_IMAGES) return `ERROR: a maximum of ${MAX_IMAGES} images is allowed`;
  const { cwd, responseId, previousResponseId, callerResponse, model } = options;
  const content = [
    { type: "input_text", text: prompt },
    ...(await prepareImageInspectionContent(images, { cwd, detail: args?.detail || "low" })),
  ];
  const parent = previousResponseId || callerResponse?.previous_response_id || responseId;
  return {
    model,
    input: [{ role: "user", content }],
    ...(parent ? { previous_response_id: parent } : {}),
    store: true,
    tools: [{ type: "shell", environment: { type: "local" } }, { type: "image_generation" }],
  };
}
