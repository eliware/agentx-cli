import { readFile } from "node:fs/promises";
import { getSetupPaths } from "./setup-paths.mjs";
import { updateEnvText } from "./setup-env-format.mjs";
import { loadSetupEnvState } from "./setup-env-state.mjs";
import { writeSetupEnvAtomically } from "./setup-env-atomic-write.mjs";

async function readOptionalText(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function readEnvState(filePath = getSetupPaths().envPath) {
  let text = "";
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return loadSetupEnvState(filePath, text, writeEnvState);
}

export async function writeEnvState(filePath, values, baseText = null) {
  const text = baseText === null ? await readOptionalText(filePath) : baseText;
  const updates = Object.fromEntries(Object.keys(values).map((key) => [key, values[key]]));
  const nextText = updateEnvText(text ?? "", updates);
  await writeSetupEnvAtomically(filePath, nextText);
  return nextText;
}

export async function saveEnvStateValue(envState, key, value) {
  envState.values[key] = value;
  envState.text = await writeEnvState(envState.filePath, envState.values, envState.text);
}
