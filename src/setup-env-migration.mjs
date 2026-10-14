import { configVersion } from "./setup-env-format.mjs";

export function migrateSetupValues(values, text) {
  const nextValues = { ...values };
  const updates = {};
  const version = configVersion();
  if (text && Number(nextValues[version.key] || 0) < Number(version.current)) {
    updates[version.key] = version.current;
    if (nextValues.AGENTX_MODEL === "gpt-5.6-luna") {
      updates.AGENTX_MODEL = "gpt-6-luna";
      nextValues.AGENTX_MODEL = "gpt-6-luna";
    }
  }
  delete nextValues[version.key];
  return { values: nextValues, updates };
}
