import { API_PRICING } from "@eliware/openai";
import { saveEnvStateValue } from "./setup-env.mjs";
import { selectChoice } from "./setup-choice.mjs";
export { selectChoice } from "./setup-choice.mjs";

export const choices = {
  model: Object.keys(API_PRICING),
  mode: ["standard", "pro"],
  effort: ["none", "low", "medium", "high", "xhigh", "max"],
  summary: ["concise", "detailed", "auto", "null"],
  verbosity: ["low", "medium", "high"],
};

export const labels = {
  model: "Model",
  mode: "Reasoning mode",
  effort: "Reasoning effort",
  summary: "Reasoning summary",
  verbosity: "Output verbosity",
};

export async function editValue(stdin, stdout, rl, envState, key, label, valuesList) {
  const value = await selectChoice(stdin, stdout, rl, label, valuesList, envState.values[key]);
  if (value && value !== envState.values[key]) await saveEnvStateValue(envState, key, value);
}
