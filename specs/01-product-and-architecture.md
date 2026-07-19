# Product and architecture

AgentX is an ESM-only Node.js terminal chat agent. It sends user messages to the OpenAI Responses API using a WebSocket transport, streams assistant output, executes model-requested local tools, and preserves conversation state in the launch directory.

## Goals
- Feel like a shell while remaining a conversational agent.
- Do not contact OpenAI until the user submits a normal message.
- Keep local shell commands, working-directory changes, and agent conversation distinct.
- Resume stored Responses API conversations after restart.
- Be cross-platform for path handling and shell launchers.
- Make interruptions around side-effecting tools explicit and safe.

## Components
- `agentx.mjs`: executable bootstrap, dotenv loading, flags, setup prompt, and error boundary.
- `agentx-setup.mjs`: executable setup wrapper.
- `src/agent.mjs`: long-lived REPL and top-level lifecycle.
- `src/agent-session.mjs`: request streaming, response processing, tool loop, status output.
- `src/openai-websocket.mjs`: raw WebSocket framing and event parsing.
- `src/openai-transport.mjs`: one-request transport abstraction, reconnect, event routing.
- `src/tool-dispatch.mjs`, `tool-shell.mjs`: model tool execution.
- `src/session-state.mjs`: `.agentx_responseid` persistence.
- `src/setup.mjs`, `settings.mjs`: configuration.
- `shell*.mjs`, `path-completion.mjs`: commands, prompt display, cwd, AGENTS discovery, completion.
- `prompt.json`: request template.

Only one Responses request may be in flight per transport. Tool calls can cause multiple sequential Responses requests as outputs are returned to the model.
