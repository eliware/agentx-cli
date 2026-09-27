import { path as resolvePath } from "@eliware/common";
import { cleanupStaleOneShotStates } from "../conversation-state-cleanup.mjs";
import { readLatestCheckpoint } from "../conversation-checkpoint.mjs";
import { readSessionState } from "../conversation-state.mjs";
import { parseCliArgs } from "../cli-args.mjs";
import { normalizeOutputFlags } from "../cli-flags.mjs";
import { loadPromptTemplate } from "../prompt-loader.mjs";
import { applySettings, settingsFromEnv } from "../settings.mjs";
import { readAgentsFromCwdAndParents } from "../shell-agents.mjs";
import { createUsageTotals } from "../response.mjs";
import { restoreSessionState } from "./session-restore.mjs";
import { resolveAgentApiKey } from "./client.mjs";

const defaultDependencies = {
  resolvePath,
  cleanupStaleOneShotStates,
  readLatestCheckpoint,
  readSessionState,
  parseCliArgs,
  normalizeOutputFlags,
  loadPromptTemplate,
  applySettings,
  settingsFromEnv,
  readAgentsFromCwdAndParents,
  createUsageTotals,
  restoreSessionState,
  resolveAgentApiKey,
};

export async function prepareAgentSession(
  {
    promptPath,
    cwd,
    oneShot = false,
    flags = null,
    argv = process.argv.slice(2),
    env = process.env,
    pid = process.pid,
    now = Date.now(),
  },
  dependencies = {},
) {
  const deps = { ...defaultDependencies, ...dependencies };
  const outputFlags = deps.normalizeOutputFlags({ ...deps.parseCliArgs(argv).flags, ...flags });
  const sessionStatePath = deps.resolvePath(cwd, ".agentx_responseid");
  await deps.cleanupStaleOneShotStates(cwd, now);
  const checkpointPath = deps.resolvePath(cwd, ".agentx_checkpoint");
  const statePath = oneShot ? `${sessionStatePath}.oneshot-${pid}-${now}` : sessionStatePath;
  const template = deps.applySettings(
    await deps.loadPromptTemplate(promptPath, undefined, env, { loadMcp: !outputFlags.noMcp }),
    deps.settingsFromEnv(env),
  );
  let agentsText;
  try {
    agentsText = await deps.readAgentsFromCwdAndParents(cwd);
  } catch (error) {
    throw new Error(
      `Unable to read AGENTS.md files under ${cwd}: ${error?.message || String(error)}`,
    );
  }
  const savedState = oneShot
    ? (await deps.readLatestCheckpoint(checkpointPath, sessionStatePath)) || null
    : await deps.readSessionState(statePath);
  const restoredSession = deps.restoreSessionState(savedState, deps.createUsageTotals);
  const apiKey =
    env.agentx_api_key ||
    env.AGENTX_API_KEY ||
    (env.JEST_WORKER_ID ? "test-key" : deps.resolveAgentApiKey(env));

  return {
    outputFlags,
    checkpointPath,
    statePath,
    template,
    agentsText,
    savedState,
    savedResponseId: savedState?.response_id || "",
    restoredSession,
    apiKey,
  };
}
