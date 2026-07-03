import { buildDeveloperText } from './prompt-text.mjs';

function cloneTemplate(template) {
  return JSON.parse(JSON.stringify(template));
}

export function applyFirstUserMessage(template, userMessage, agentsText, cwd) {
  const cloned = cloneTemplate(template);
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
  return cloned;
}

export function buildInputMessage(text) {
  return {
    role: 'user',
    content: [{ type: 'input_text', text }],
  };
}
