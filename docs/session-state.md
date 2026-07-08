# Session state

AgentX stores session state in `.agentx_responseid` in the current working directory.

## Saved data

The file keeps:

- the latest response id
- usage totals
- the last user message
- the last assistant message
- any pending local shell transcript

## Resume behavior

If the file exists on startup, AgentX resumes the previous conversation using `previous_response_id` and `store: true`.

## Reset behavior

Use `/clear` to delete the stored session state and start a fresh conversation.
