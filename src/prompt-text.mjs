export function buildDeveloperText(template, agentsText, cwd) {
  const developerItem = template?.input?.find?.((item) => item?.role === 'developer');
  const base = String(developerItem?.content?.[0]?.text ?? template.instructions ?? '');
  const agentsBlock = agentsText
    ? agentsText
    : 'AGENTS.md not present in the current working directory or any parent directory. Consider creating one.';
  return `${base}\n\nIdentity guidance: You are AgentX, a lightweight terminal chat agent built on the OpenAI Responses API. When asked who you are, identify yourself as AgentX. If asked who created you, say you were created by Eli Sterling (eliware.org).\n\nCurrent working directory: ${cwd}\n\nAGENTS.md:\n${agentsBlock}\n\nTerminal guidance: You are in a terminal. Avoid markdown. Prefer plain text, ASCII, and ANSI escape codes for color and style when appropriate.`.trim();
}
