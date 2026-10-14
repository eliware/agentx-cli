# Usage and cost

AgentX reports token totals and an estimated cost. It uses the configured model and the pricing data from `@eliware/openai`.

## View usage

Run `/usage` in an interactive session to view totals. AgentX also prints usage after a response unless you set `--no-usage` or `--quiet`.

The report can include input, cached input, cache-write, output, and reasoning tokens. It shows per-turn and session totals when the API provides those values.

## Cost estimate

AgentX gets model rates from the OpenAI client. The client model catalog also supplies the model choices in `agentx-setup`. AgentX does not keep a separate model or rate list.

The report marks long-context use when the client pricing result sets `long_context` to true. Rates can change when the OpenAI client changes. The estimate can differ from your provider bill.

## Hide usage output

Use `--no-usage` (`-u`) to hide usage for one run. Use `--quiet` (`-q`) to hide usage and other status output. These options do not change usage accounting.

See the [command guide](commands.md) for all output options. See the [session guide](conversation-state.md) for saved usage totals.
