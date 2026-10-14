import { saveGeneratedImage } from "./image-generation.mjs";

export async function collectGeneratedImagePaths(response) {
  const paths = [];
  for (const item of response?.output || []) {
    if (item?.type === "image_generation_call" && item?.result)
      paths.push(await saveGeneratedImage(item));
  }
  return paths;
}

export function formatImageBranchResult(text, generatedPaths) {
  const generated = generatedPaths.length
    ? `Generated image path(s): ${generatedPaths.join(", ")}`
    : "";
  return [text, generated].filter(Boolean).join("\n\n") || "The image inspection returned no text.";
}
