# Product and architecture

AgentX is an ESM-only Node.js terminal chat agent. It sends user messages to the OpenAI Responses API through the official `@eliware/openai` client, streams assistant output, executes model-requested local tools, and preserves conversation state in the launch directory.

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
- `@eliware/openai`: official OpenAI Responses client, transport, streaming, errors, lifecycle, and test/mocking support.
- `src/tool-dispatch.mjs`, `tool-shell.mjs`: model tool execution.
- `src/session-state.mjs`: `.agentx_responseid` persistence.
- `src/setup.mjs`, `settings.mjs`: configuration.
- `shell*.mjs`, `path-completion.mjs`: commands, prompt display, cwd, AGENTS discovery, completion.
- `prompt.json`: request template.

The integration delegates Responses transport, connection lifecycle, streaming, reconnect behavior, event normalization, and API errors to `@eliware/openai`. AgentX owns session state, tool dispatch, and user-facing recovery. Tool calls execute sequentially by default; no parallel tool execution is allowed. Tool calls can cause multiple sequential Responses requests as outputs are returned to the model. Each assistant-turn tool call has one dispatch identity and must not be re-enqueued or executed more than once.
