# Usage and cost

AgentX reports token totals and estimated cost. It uses the selected model and pricing data from `@eliware/openai`.

## View usage

Run `/usage` in a session to view totals. AgentX also shows usage after a response unless you use `--no-usage` or `--quiet`.

The report can show input, cached input, cache-write, output, and reasoning tokens. It shows turn and session totals when the API returns them.

## Read cost estimates

The OpenAI client catalog supplies model choices and rates. AgentX does not keep a separate model or rate list.

The report warns when the pricing data marks a request as long-context use. The estimate can differ from your provider bill. Model rates can change when the client catalog changes.

## Hide usage output

Use `--no-usage` (`-u`) to hide usage for one run. Use `--quiet` (`-q`) to hide usage and other status output.

These options change display only. AgentX still tracks usage totals. See the [command guide](commands.md) for all output options.
