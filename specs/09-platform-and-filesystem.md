# Platform and filesystem behavior

Target Node.js environments include Linux/macOS and Windows. Use ESM and Node built-ins; avoid shell-specific assumptions outside the shell launcher abstraction.

Home resolution: Windows prefers `HOME`, then `USERPROFILE`, then `HOMEDRIVE + HOMEPATH`; other platforms use `HOME` with `USERPROFILE` fallback. Prompt identity uses `USER`/`USERNAME` and `HOSTNAME`/`COMPUTERNAME`, with `root` and `dev` fallbacks.

Shell launchers: POSIX `/bin/sh -lc`; Windows try `pwsh -NoLogo -NoProfile -Command`, then `powershell.exe`, then `cmd.exe /d /s /c`. If a launcher is missing, try the next. The process-execution module owns launch fallback, streamed decoding, output truncation, timeout/abort handling, and process termination. A focused shell-sequence module owns command normalization, sequential execution, and aggregate status/output shape. Mirrored tests keep process lifecycle assertions at the process boundary and sequence ordering/aggregation assertions at the sequence boundary. Preserve command exit status, stdout, stderr, timeout, and signal information in tool output. Direct interactive `!` commands have no timeout; Ctrl-C terminates the POSIX process group (or Windows child process), and the shell runner reports completion/interruption after the process stops.

User paths expand a leading `~`, resolve relative to active cwd, and normalize using the platform path module. `cd` must reject nonexistent paths and non-directories with a shell-like error.

AGENTS discovery loads `$HOME/AGENTS.md` plus current cwd and each parent from least-specific to most-specific. Read each real file once, avoid duplicate symlink targets, and join contents in order. A missing file is normal.

Worker state uses a private per-user platform state directory, not a directory under the working tree. Linux honors `XDG_STATE_HOME` (default `~/.local/state`), macOS uses `~/Library/Application Support`, and Windows uses `%LOCALAPPDATA%`; AgentX adds its own application/worker directories and a stable hash of the canonical cwd. On POSIX, worker directories are mode `0700` and record, log, and temporary files are mode `0600`. Existing `<cwd>/.agentx/workers` entries remain readable and cleanable for compatibility, including when `<cwd>/.agentx` is a regular file (in which case there can be no legacy entries).
