import { applyFirstUserMessage, buildInputMessage } from './prompt-builder.mjs';
import { path } from '@eliware/common';
import { homedir } from 'node:os';
import { readJson } from './runtime.mjs';
import { getHomeDirectory } from './platform.mjs';

export function resolveAgentApiKey(env = process.env) {
  const apiKey = String(env.agentx_api_key || env.AGENTX_API_KEY || '').trim();
  if (apiKey) return apiKey;
  throw new Error('Set agentx_api_key or AGENTX_API_KEY in your shell environment.');
}

export async function loadPromptTemplate(promptPath, mcpPath = path(getHomeDirectory() || homedir(), '.agentx.mcp.json'), env = process.env, { loadMcp = true } = {}) {
  try {
    const template = await readJson(promptPath);
    let mcpTools = null;
    if (loadMcp) {
      try {
        const configuredTools = await readJson(mcpPath);
        const configuredEntries = Array.isArray(configuredTools) ? configuredTools : configuredTools?.tools || [];
        mcpTools = configuredEntries.filter((tool) => tool?.type !== 'mcp' || tool.enabled !== false);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    const merged = mcpTools === null ? template : { ...template, tools: [...(template.tools || []), ...mcpTools] };
    if (!env?.AGENTX_WORKER_ID) return merged;
    return { ...merged, tools: (merged.tools || []).filter((tool) => !['spawn_agent', 'agent_status', 'cancel_agent'].includes(tool?.name)) };
  } catch (error) {
    throw new Error(`Unable to read prompt template at ${promptPath}: ${error?.message || String(error)}`);
  }
}

function formatShellCommandOutput(output) {
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    const stdout = String(output.stdout ?? '').trimEnd();
    const stderr = String(output.stderr ?? '').trimEnd();
    const parts = [];
    if (stdout) parts.push(stdout);
    if (stderr) parts.push(stdout ? `stderr:\n${stderr}` : stderr);
    return parts.join('\n\n').trimEnd();
  }
  return String(output ?? '').trimEnd();
}

export function appendCliTranscript(existingTranscript, command, outputText) {
  const entry = [`! ${command}`];
  const trimmedOutput = formatShellCommandOutput(outputText);
  if (trimmedOutput) entry.push(trimmedOutput);
  return [existingTranscript, entry.join('\n')].filter(Boolean).join('\n\n');
}

export function buildRequestMessage({ pendingCliTranscript, cwdNote, message }) {
  const contextParts = [];
  if (pendingCliTranscript) {
    contextParts.push(`Local shell commands and output since the last assistant message:\n\n${pendingCliTranscript}`);
  }
  if (cwdNote) {
    contextParts.push(cwdNote);
  }
  contextParts.push(message);
  return contextParts.join('\n\n');
}

export const WORKER_ROLE_MESSAGE = 'You are a delegated worker, not the orchestrator. Complete only the task in the user message. Do not spawn agents, orchestrate other work, broaden scope, or wait for further instructions. Inspect, change, and verify only what is needed for this task, then report the result.';

export const GOAL_TOOL_NAMES = new Set(['goal_update', 'goal_blocked']);

export function withGoalTools(template, enabled) {
  const tools = (template?.tools || []).filter((tool) => !GOAL_TOOL_NAMES.has(tool?.name));
  return enabled ? { ...template, tools: [...tools, ...(template?.tools || []).filter((tool) => GOAL_TOOL_NAMES.has(tool?.name))], tool_choice: 'required' } : { ...template, tools };
}

export function buildRequestOverride(template, userMessage, agentsText, cwd, previousResponseId, workerRoleMessage = '') {
  if (previousResponseId) {
    const input = [buildInputMessage(userMessage)];
    if (workerRoleMessage) input.unshift({ role: 'developer', content: [{ type: 'input_text', text: workerRoleMessage }] });
    return {
      ...template,
      input,
      store: true,
      previous_response_id: previousResponseId,
    };
  }

  return {
    ...applyFirstUserMessage(template, userMessage, agentsText, cwd),
    store: true,
  };
}
