# Session state

AgentX stores session state in `.agentx_responseid` in the current working directory.

## Saved data

The file keeps:

- the latest response id
- usage totals
- the last user message
- the last assistant message
- any pending local shell transcript
- any pending tool calls plus their response usage, if a turn was interrupted mid-execution

## Resume behavior

If the file exists on startup, AgentX resumes the previous conversation using `previous_response_id` and `store: true`.
If pending tool calls are present, AgentX asks whether to continue executing them before returning to the REPL.
If that response id is no longer usable, AgentX can start a new chain and continue from the saved local context.

## Reset behavior

Use `/clear` to delete the stored session state and start a fresh conversation.
