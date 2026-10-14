import { createInterface } from "node:readline/promises";
import { editApiKey } from "./setup-api-key-editor.mjs";
import { editCompaction } from "./setup-compaction-editor.mjs";
import { choices, editValue, labels } from "./setup-editors.mjs";

const setupActionDefaults = { createInterface, editApiKey, editCompaction, editValue };

export async function applySetupAction(id, context, deps = setupActionDefaults) {
  const { stdin, stdout, readlineInput, envState } = context;
  let { readline, message } = context;
  if (id === "quit") return { readline, message, quit: true };
  if (id === "api") {
    readline.close();
    message = await deps.editApiKey(readlineInput, envState, stdout);
    readline = deps.createInterface({ input: readlineInput, output: stdout });
  } else if (id === "model") {
    await deps.editValue(
      stdin,
      stdout,
      readline,
      envState,
      "AGENTX_MODEL",
      labels.model,
      choices.model,
    );
  } else if (id === "mode") {
    await deps.editValue(
      stdin,
      stdout,
      readline,
      envState,
      "AGENTX_REASONING_MODE",
      labels.mode,
      choices.mode,
    );
  } else if (id === "effort") {
    await deps.editValue(
      stdin,
      stdout,
      readline,
      envState,
      "AGENTX_REASONING_EFFORT",
      labels.effort,
      choices.effort,
    );
  } else if (id === "summary") {
    await deps.editValue(
      stdin,
      stdout,
      readline,
      envState,
      "AGENTX_REASONING_SUMMARY",
      labels.summary,
      choices.summary,
    );
  } else if (id === "verbosity") {
    await deps.editValue(
      stdin,
      stdout,
      readline,
      envState,
      "AGENTX_OUTPUT_VERBOSITY",
      labels.verbosity,
      choices.verbosity,
    );
  } else if (id === "compaction") {
    await deps.editCompaction(readline, envState, stdout);
  }
  return { readline, message, quit: false };
}
