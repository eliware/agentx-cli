import { runToolCall } from "./tool-dispatch.mjs";
import { toolOutputForCall } from "./tool-output-adapter.mjs";
import { saveGeneratedImage } from "./image-generation.mjs";
import { extractTextFromResponse, extractUsage } from "./response.mjs";

const BRANCH_TOOLS = [
  { type: "shell", environment: { type: "local" } },
  { type: "image_generation" },
];

export async function executeImageBranch(openai, request, { cwd, onUsage } = {}) {
  let completed = await openai.responses.create(request);
  onUsage?.(extractUsage(completed));
  const generatedPaths = [];

  for (let turn = 0; turn < 10; turn += 1) {
    for (const item of completed?.output || []) {
      if (item?.type === "image_generation_call" && item?.result)
        generatedPaths.push(await saveGeneratedImage(item));
    }
    const calls = (completed?.output || []).filter((item) => item?.type === "shell_call");
    if (!calls.length) break;

    const outputs = [];
    for (const call of calls) {
      outputs.push(
        toolOutputForCall(
          call,
          await runToolCall(call, cwd, {
            permission: process.env.AGENTX_PERMISSION || "execute",
          }),
        ),
      );
    }
    completed = await openai.responses.create({
      model: request?.model,
      input: outputs,
      previous_response_id: completed.id,
      store: true,
      tools: request?.tools ?? BRANCH_TOOLS,
    });
    onUsage?.(extractUsage(completed));
  }

  const text = extractTextFromResponse(completed);
  const generated = generatedPaths.length
    ? `Generated image path(s): ${generatedPaths.join(", ")}`
    : "";
  return [text, generated].filter(Boolean).join("\n\n") || "The image inspection returned no text.";
}
