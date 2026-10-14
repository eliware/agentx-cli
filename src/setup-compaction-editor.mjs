import { saveEnvStateValue } from "./setup-env.mjs";

export async function editCompaction(rl, envState, stdout) {
  const input = (
    await rl.question(
      `Compaction threshold tokens [${envState.values.AGENTX_COMPACTION_THRESHOLD}]: `,
    )
  ).trim();
  if (!input) return;
  const value = Number(input.replaceAll(/[^0-9]/g, ""));
  if (!Number.isInteger(value) || value < 1) {
    stdout.write("Enter a positive token count.\n");
    return;
  }
  await saveEnvStateValue(envState, "AGENTX_COMPACTION_THRESHOLD", String(value));
  if (value > 270000) stdout.write("Warning: jumbo prompts cost 2x above 270k tokens.\n");
}
