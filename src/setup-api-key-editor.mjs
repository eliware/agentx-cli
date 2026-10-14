import { saveEnvStateValue } from "./setup-env.mjs";
import { askMasked } from "./setup-menu.mjs";

export async function editApiKey(input, envState, stdout) {
  const current = String(envState.values.AGENTX_API_KEY || "");
  const suffix = current ? `********${current.slice(-8)}` : "(blank)";
  while (true) {
    const answer = String(await askMasked(input, stdout, `API key [${suffix}]: `, current)).trim();
    const next = answer || current;
    if (!next) {
      stdout.write("API key is required.\n");
      continue;
    }
    await saveEnvStateValue(envState, "AGENTX_API_KEY", next);
    stdout.write("API key saved.\n");
    return "API key saved.";
  }
}
