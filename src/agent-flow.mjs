import { buildInputMessage } from './prompt-builder.mjs';
import { buildDeveloperText } from './prompt-text.mjs';
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

export function appendCliTranscript(existingTranscript, command, outputText) {
  const entry = [`> ${command}`];
  const trimmedOutput = String(outputText ?? '').trimEnd();
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

  const cloned = JSON.parse(JSON.stringify(template));
  const developer = cloned?.input?.find?.((item) => item?.role === 'developer');
  const developerContent = developer?.content?.[0];
  if (developerContent?.type === 'input_text') {
    developerContent.text = buildDeveloperText(cloned, agentsText, cwd);
  }
  const firstUser = cloned?.input?.find?.((item) => item?.role === 'user');
  const firstContent = firstUser?.content?.[0];
  if (firstContent?.type === 'input_text') {
    const original = String(firstContent.text ?? '');
    firstContent.text = original.includes('first user message')
      ? original.replaceAll('first user message', userMessage)
      : userMessage;
  }
  return {
    ...cloned,
    store: true,
  };
}
