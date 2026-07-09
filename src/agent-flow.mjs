import { applyFirstUserMessage, buildInputMessage } from './prompt-builder.mjs';
import { readJson } from './runtime.mjs';

export function resolveAgentApiKey(env = process.env) {
  const apiKey = String(env.agentx_api_key || env.AGENTX_API_KEY || '').trim();
  if (apiKey) return apiKey;
  throw new Error('Set agentx_api_key or AGENTX_API_KEY in your shell environment.');
}

export async function loadPromptTemplate(promptPath) {
  try {
    return await readJson(promptPath);
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
  const entry = [`> ${command}`];
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

export function buildRequestOverride(template, userMessage, agentsText, cwd, previousResponseId) {
  if (previousResponseId) {
    return {
      ...template,
      input: [buildInputMessage(userMessage)],
      store: true,
      previous_response_id: previousResponseId,
    };
  }

  return {
    ...applyFirstUserMessage(template, userMessage, agentsText, cwd),
    store: true,
  };
}
