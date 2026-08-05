# Examples

These examples work the same after a global install or a local repo run.

## Ask a question

```text
What can you do?
```

## Change directories

```text
cd /var/log
```

## Run a local command

```text
! pwd
```

## Combine shell output with the next prompt

```text
> git status
Summarize the repository state
```

## Clear the current session

```text
/clear
```

## One-shot request

```bash
agentx "summarize the current repository"
```

Add `--confirm` when the request should require confirmation for model-requested CLI execution:

```bash
agentx --confirm "run the tests and report failures"
```
