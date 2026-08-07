# Usage, errors, and verification

Use model pricing tables for the supported models and calculate costs in integer nano-dollars to avoid floating-point drift. Track input, cached input, output, and turns separately. A prompt above 272,000 input tokens is long-context: apply long-context pricing to input, cached input, and output and show a warning. Long-context input and cached-input rates are 2x short-context rates; output rates are 1.5x.

Errors should be actionable and human-readable:
- missing API key: tell the user to set `agentx_api_key` or `AGENTX_API_KEY` or run setup;
- prompt/MCP read or parse error: include the prompt path and underlying message;
- unavailable prior response: clear session and explain it;
- recoverable OpenAI/API failure: keep the REPL alive, preserve state, and offer bounded retry, new-chain, rollback, or clear recovery;
- repeated continuation failure: never loop indefinitely or resume the same failed continuation automatically;
- noninteractive setup: say it requires an interactive terminal;
- shell failures: preserve stderr and exit information for the model.

Package behavior: ESM-only, Node executable scripts, MIT license, npm scripts `start`, `lint`, `test`, and `setup`. The test command runs Jest with coverage, VM modules, open-handle detection, silent output, and serial execution.

Tool execution tests must verify sequential ordering, duplicate-call suppression across retries/resume, and exactly one side effect per dispatch identity. `@eliware/openai` is the source of truth for Responses transport, WebSocket lifecycle, reconnect, framing, event normalization, streaming, API errors, and transport mocks; AgentX must not duplicate those tests or implementation. AgentX tests should cover only its client configuration/integration boundary plus pure helpers (settings, env serialization, path resolution/completion, prompt construction, response handling, usage math, persistence), command dispatch, setup menu behavior, and REPL lifecycle. Also verify direct-vs-imported launcher behavior, Windows path branches, interrupted tool resume, malformed saved state, missing MCP config, and no API contact before the first normal message.

Recovery tests must verify that a failed tool-continuation retry cannot be silently replayed as the next new user request, and that abandoned pending retry state is cleared or requires an explicit resume action.
