# Examples

Use these examples in an interactive session or from a terminal.

## Ask a question

Enter a message and press Enter:

```text
What can you do?
```

## Change directories

Enter `cd` followed by a path:

```text
cd /var/log
```

## Run a local command

Prefix a command with `!`:

```text
! pwd
```

Press Ctrl-C to stop a long-running local command.

## Send local output with a message

Run a local command, then enter a message:

```text
! git status
Summarize the repository state.
```

AgentX sends the command output with the next message.

## Clear the session

Enter this command to start a fresh conversation:

```text
/clear
```

## Send one request

Pass one quoted message to AgentX:

```sh
agentx "summarize the current repository"
```

Add `--confirm` to ask for approval before high-risk tool calls:

```sh
agentx --confirm "run the tests and report failures"
```

## Work toward a goal

Enter `/goal` and describe the result you need:

```text
/goal inspect the project, run focused checks, and summarize any issues
```

Use `/goal status` to check progress. Use `/goal cancel` to stop the goal.
