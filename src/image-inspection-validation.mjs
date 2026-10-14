export const MAX_IMAGES = 10;
export const MAX_PROMPT_LENGTH = 10_000;

export function validateImageInspectionArgs(args) {
  const prompt = String(args?.prompt ?? "").trim();
  if (!prompt) return { error: "ERROR: image prompt is required" };
  if (prompt.length > MAX_PROMPT_LENGTH)
    return { error: `ERROR: image prompt exceeds the ${MAX_PROMPT_LENGTH} character limit` };
  const images = Array.isArray(args?.images) ? args.images : [];
  if (!images.length) return { error: "ERROR: at least one image is required" };
  if (images.length > MAX_IMAGES)
    return { error: `ERROR: a maximum of ${MAX_IMAGES} images is allowed` };
  return { prompt, images };
}
