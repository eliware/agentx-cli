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

Add `--yolo` when the request should approve all model-requested CLI execution:

```bash
agentx --yolo "run the tests and report failures"
```
