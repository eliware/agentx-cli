# Usage, errors, and verification

Keep usage pricing/cost calculation separate from usage normalization and report formatting. The pricing module owns model rates, long-context selection, and integer nano-dollar calculations; usage reporting consumes that API to format reports. Mirror these boundaries in tests: price/rate/cost assertions belong in the pricing suite, while normalization and report-shape assertions belong in the usage-report suite. GPT-6 Luna Standard short-context rates per million tokens are $0.10 input, $0.01 cached input, $0.125 cache writes, and $0.50 output. For long context, use $0.20, $0.02, $0.25, and $0.75 respectively. A prompt above 272,000 input tokens is long-context: apply the model's long-context rates and show a warning. Other supported models retain their own model-specific rates; long-context rates are 2x short-context input, cached-input, and cache-write rates, and 1.5x output rates where applicable.

Usage normalization is a pure boundary owned by `usage-normalization.mjs`: it strips ANSI sequences and coerces provider token counts. Its mirrored `tests/usage-normalization.test.mjs` covers those behaviors. `usage.mjs` assembles per-turn and cumulative reports, while `usage-pricing.mjs` owns pricing and cost calculations.

Response transcript formatting tests live beside `agent-turn/response-format.mjs`; provider usage extraction tests belong to `response-parts.test.mjs`, and session-file/legacy response-ID tests belong to the conversation-state suites. Do not group these independent contracts in one response-format test file.

Errors should be actionable and human-readable:

- missing API key: tell the user to set `agentx_api_key` or `AGENTX_API_KEY` or run setup;
- prompt/MCP read or parse error: include the prompt path and underlying message;
- unavailable prior response: clear session and explain it;
- recoverable OpenAI/API failure: keep the REPL alive, preserve state, and offer bounded retry, new-chain, rollback, or clear recovery;
- repeated continuation failure: never loop indefinitely or resume the same failed continuation automatically;
- noninteractive setup: say it requires an interactive terminal;
- shell failures: preserve stderr and exit information for the model.

Package behavior: ESM-only, Node executable scripts, MIT license, npm scripts `start`, `lint`, `audit`, `test`, `setup`, and `validate:package`. The package validation script checks the npm dry-run artifact for required runtime files and rejects test, state, credential, and build artifacts. The audit script checks production dependencies from the lockfile with `npm audit --omit=dev --audit-level=moderate`. The test command runs Jest with coverage, VM modules, open-handle detection, silent output, and serial execution.

Tool execution tests must verify sequential ordering, duplicate-call suppression across retries/resume, and exactly one side effect per dispatch identity. `@eliware/openai` is the source of truth for Responses transport, WebSocket lifecycle, reconnect, framing, event normalization, streaming, API errors, and transport mocks; AgentX must not duplicate those tests or implementation. AgentX tests should cover only its client configuration/integration boundary plus pure helpers (settings, env serialization, path resolution/completion, prompt construction, response handling, usage math, persistence), command dispatch, setup menu behavior, and REPL lifecycle. Also verify direct-vs-imported launcher behavior, Windows path branches, interrupted tool resume, malformed saved state, missing MCP config, and no API contact before the first normal message.

Recovery tests must verify that manual retry recreates the Responses client, that a failed tool-continuation retry cannot be silently replayed as the next new user request, and that abandoned pending retry state is cleared or requires an explicit resume action. Cross-platform tests must use native path expectations and portable shell commands, and filesystem errors such as a file where `.agentx` expects a directory must remain distinguishable from a missing directory on Windows.
