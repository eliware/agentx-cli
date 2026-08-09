# Configuration

AgentX reads configuration from the process environment and the user-owned `~/.agentx` file. Never commit either file.

## API key

| Name | Required | Default | Format | Sensitive | Effect |
| --- | --- | --- | --- | --- | --- |
| `agentx_api_key` / `AGENTX_API_KEY` | Yes | None | OpenAI API key string | Yes | Authenticates Responses API requests. The lowercase name is checked first. |

`agentx-setup` can write the key and runtime settings to `~/.agentx`. Environment values remain available for shell and CI use.

## Runtime settings

The `/setup` flow edits the supported settings stored in `~/.agentx`:

- model: model identifier sent to the Responses API;
- reasoning: reasoning effort setting;
- output: output verbosity setting;
- compaction: server-side compaction configuration.

Values are validated by the setup flow before they are saved. Defaults and accepted values are shown by `/setup`; keep the generated file user-owned and do not paste credentials into issue reports or logs.

## Local state

AgentX stores session state in `.agentx_responseid` and successful checkpoints in `.agentx_checkpoint` in the launch directory. One-shot pending state uses temporary `.agentx_responseid.oneshot-*` files. These files may contain conversation metadata and must not be committed.

## Release validation

Before publishing, run:

```bash
npm test
npm run test:gaps
npm run lint
npm run audit
npm pack --dry-run
```

The audit checks production dependencies only and fails on moderate-or-higher advisories. CI runs the same checks before the publish step.
