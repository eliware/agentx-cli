const WORKER_TOOLS = new Set(["spawn_agent", "agent_status", "cancel_agent"]);

export function filterWorkerTools(template, env) {
  if (!env?.AGENTX_WORKER_ID) return template;
  return {
    ...template,
    tools: (template.tools || []).filter((tool) => !WORKER_TOOLS.has(tool?.name)),
  };
}
