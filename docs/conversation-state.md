# Session state

AgentX stores an interactive session in `.agentx_responseid` in the current working directory. A completed turn also updates `.agentx_checkpoint` for one-shot requests.

## Saved data

The session file can contain the latest response ID, usage totals, the last user and assistant messages, and pending shell output.

It can also contain pending tool calls, successful checkpoints, rollback data, and recovery state. Keep this file private.

## Resume a session

AgentX resumes the saved conversation at startup. It waits for your first message before it contacts OpenAI.

If saved state contains pending tool calls, AgentX asks how you want to continue. It does not repeat an interrupted call unless you choose an action that runs it.

If OpenAI cannot use the saved response ID, AgentX can start a new response chain from saved local context. Recoverable errors offer retry, new-chain, rollback, or clear actions.

Failed responses do not become successful checkpoints. AgentX retries transient closed or expired connections for up to 10 seconds before normal recovery.

## Roll back a checkpoint

Run `/rollback` to select a successful response checkpoint. Select a row with its number, the arrow keys, or Enter.

Rollback restores conversation metadata and usage. It clears pending tool calls and newer checkpoints. It does not undo shell commands or other external actions.

AgentX keeps one backup of discarded newer checkpoints until the next successful turn or session clear.

## Clear a session

Run `/clear` to delete the saved session and start a fresh conversation. AgentX resets its active session data before it deletes the file.

## One-shot requests

One-shot mode reads the latest successful checkpoint. It does not resume interactive pending tool calls.

Each one-shot uses a separate pending-state file. A successful request removes that file. An interrupted request keeps it for diagnosis and does not change the interactive session.

## Concurrent requests

One-shot requests in the same directory use separate pending-state files. Each request branches from the latest successful checkpoint.

An interactive turn or rollback updates the shared checkpoint. A one-shot request does not write its pending state into the interactive session.

## Goal state

AgentX saves active goal details during a session. It discards goal state at startup. A goal never resumes or contacts OpenAI after restart.
