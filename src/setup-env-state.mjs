import { decodeEnvValue, knownSetupKeys, parseEnvLines } from "./setup-env-format.mjs";
import { migrateSetupValues } from "./setup-env-migration.mjs";

export async function loadSetupEnvState(filePath, text, persistUpdates) {
  const values = { AGENTX_API_KEY: "" };
  const knownKeys = knownSetupKeys();
  for (const line of parseEnvLines(text))
    if (line.type === "pair" && knownKeys.has(line.key))
      values[line.key] = decodeEnvValue(line.value);
  const migration = migrateSetupValues(values, text);
  const savedText = Object.keys(migration.updates).length
    ? await persistUpdates(filePath, migration.updates, text)
    : text;
  return { filePath, text: savedText, values: migration.values };
}
