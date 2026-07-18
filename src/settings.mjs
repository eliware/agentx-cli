import { readEnvState } from './setup.mjs';

export const DEFAULT_SETTINGS = {
  model: 'gpt-5.6-luna', reasoningMode: 'standard', reasoningEffort: 'low', reasoningSummary: 'auto',
  outputVerbosity: 'low', compactionThreshold: 200000,
};

export function settingsFromEnv(env = process.env) {
  return {
    model: env.AGENTX_MODEL || DEFAULT_SETTINGS.model,
    reasoningMode: env.AGENTX_REASONING_MODE || DEFAULT_SETTINGS.reasoningMode,
    reasoningEffort: env.AGENTX_REASONING_EFFORT || DEFAULT_SETTINGS.reasoningEffort,
    reasoningSummary: env.AGENTX_REASONING_SUMMARY || DEFAULT_SETTINGS.reasoningSummary,
    outputVerbosity: env.AGENTX_OUTPUT_VERBOSITY || DEFAULT_SETTINGS.outputVerbosity,
    compactionThreshold: Number(env.AGENTX_COMPACTION_THRESHOLD) || DEFAULT_SETTINGS.compactionThreshold,
  };
}
export function applySettings(template, settings = settingsFromEnv()) {
  const next = JSON.parse(JSON.stringify(template));
  next.model = settings.model;
  next.reasoning = { ...next.reasoning, mode: settings.reasoningMode, effort: settings.reasoningEffort, summary: settings.reasoningSummary === 'null' ? null : settings.reasoningSummary };
  next.text = { ...next.text, verbosity: settings.outputVerbosity };
  next.context_management = [{ type: 'compaction', compact_threshold: settings.compactionThreshold }];
  return next;
}
export async function reloadSettings() {
  const state = await readEnvState();
  for (const [key, value] of Object.entries(state.values)) if (key !== 'AGENTX_API_KEY') process.env[key] = value;
  return settingsFromEnv();
}
