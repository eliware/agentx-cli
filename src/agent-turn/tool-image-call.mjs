const IMAGE_TOOL = "view_image";

export function isImageToolCall(call) {
  return call?.type === "function_call" && call?.name === IMAGE_TOOL;
}

export async function executeImageToolCall(
  call,
  { onViewImage, response, previousResponseId, baseRequest, cwd },
) {
  let args;
  try {
    args = JSON.parse(call?.arguments ?? call?.input ?? "{}");
  } catch {
    args = {};
  }
  return (
    (await onViewImage?.({ args, response, previousResponseId, baseRequest, cwd })) ||
    "ERROR: image inspection is unavailable"
  );
}
