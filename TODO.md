# TODO

## Startup and Configuration

- When `agentx.mjs` starts and `$HOME/.agentx` is missing or not configured:
  - Ask whether the user wants to run `agentx-setup` now (`Y/n`).
  - After setup exits, start the application automatically if the file was created and an API key was configured.
- Always load `$HOME/AGENTS.md` when it exists.
- Update the `agentx-setup` menu to support the settings below:
  - Model selection:
    - `gpt-5.6-luna` — small
    - `gpt-5.6-terra` — medium
    - `gpt-5.6-sol` — large
  - Reasoning mode: `standard` (default) or `pro`.
  - Reasoning effort: `none`, `low` (default), `medium`, `high`, `xhigh`, or `max`.
  - Reasoning summary: `concise`, `detailed`, `auto` (default), or `null` (off).
  - Output verbosity: `low` (default), `medium`, or `high`.
  - Compaction threshold: `200k` tokens by default. Warn about the jumbo-prompt 2× price increase when the threshold exceeds `270k` tokens.

## In-App Setup

- Add a `/setup` command that runs `agentx-setup` from within the application.
- After setup exits, reload the new settings without ending the current session.

## Usage and Pricing

- Implement per-model pricing calculations:

  | Model | Description | Input | Cached input | Output |
  | --- | --- | ---: | ---: | ---: |
  | GPT-5.6 Luna | Fast, affordable model for everyday work | $1.00 / 1M tokens | $0.10 / 1M tokens | $6.00 / 1M tokens |
  | GPT-5.6 Terra | Balanced model for efficient, high-volume work | $2.50 / 1M tokens | $0.25 / 1M tokens | $15.00 / 1M tokens |
  | GPT-5.6 Sol | Flagship model for ambitious agentic work | $5.00 / 1M tokens | $0.50 / 1M tokens | $30.00 / 1M tokens |

- Detect jumbo prompts during usage calculation:
  - For inputs exceeding `270k` tokens, apply 2× input pricing.
  - Display a warning when the jumbo-prompt pricing applies.

## Streaming Output

- Add handling for streamed reasoning-summary output and display it in light orange.
- Support pausing and resuming the timer status output.

## Web Server Removal

- Remove the web-server component, including:
  - `agentx-gui.mjs`
  - `agentx-gui.service`
  - All supporting frontend and backend code
  - Related tests
- Remove `PORT` and `HOST` from the `.env` file.
- Remove web-server installation and uninstallation logic from `agentx-setup`.
- Remove the build command and `webpack.config.mjs`.
