# One-shot request

Return to the [examples index](../README.md).

Prerequisites: Node.js 26.x, an installed AgentX CLI, and an API key configured with `agentx-setup` or in the environment. Do not place a real key in the command or source file.

Run:

```sh
agentx "Summarize the current project"
```

Expected result: AgentX sends one request, prints the response and usage summary, and exits. Tool execution follows the documented permission settings; add `--confirm` to request confirmation.
