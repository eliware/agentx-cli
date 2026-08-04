# Session state

Interactive AgentX stores session state in `.agentx_responseid` in the current working directory, whether you launched it from a global install or from the repository. Successful turns also update `.agentx_checkpoint`, the shared branch point for independent one-shot requests.

## Saved data

The file keeps:

- the latest response id
- usage totals
- the last user message
- the last assistant message
- any pending local shell transcript
- any pending tool calls, if a turn was interrupted mid-execution
- up to 20 successful response checkpoints for `/rollback`
- the latest rollback backup and failed-response marker, when applicable

## Resume behavior

If the file exists on startup, AgentX resumes the previous conversation using `previous_response_id` and `store: true`. One-shot mode does not resume interactive pending calls; it reads only the latest successful checkpoint and creates isolated state named `.agentx_responseid.oneshot-<pid>-<timestamp>`.
If pending tool calls are present, AgentX prompts you to continue, retry, or start a new session before returning to the REPL. One-shot pending calls remain isolated so concurrent one-shots do not conflict with each other or the interactive session.
If that response id is no longer usable, AgentX can start a new chain and continue from the saved local context. Recoverable request failures preserve state and offer bounded retry, new-chain, rollback, or clear recovery. Failed responses are not added to checkpoint history.

## Rollback

Use `/rollback` to select a successful checkpoint by number, arrows, or Enter. Rollback restores conversation metadata and usage, clears pending tool calls, and does not undo shell commands or other external side effects.

## Reset behavior

Use `/clear` to delete the stored session state and start a fresh conversation.

## Concurrent one-shots

A successful interactive turn or rollback becomes the next shared checkpoint. Each one-shot branches from that checkpoint and owns its pending tool state. Successful one-shots remove their temporary state; interrupted ones retain it for diagnosis without changing the main session.
