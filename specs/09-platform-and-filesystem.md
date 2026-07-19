# Platform and filesystem behavior

Target Node.js environments include Linux/macOS and Windows. Use ESM and Node built-ins; avoid shell-specific assumptions outside the shell launcher abstraction.

Home resolution: Windows prefers `USERPROFILE`, then `HOMEDRIVE + HOMEPATH`; other platforms use `HOME` with `USERPROFILE` fallback. Prompt identity uses `USER`/`USERNAME` and `HOSTNAME`/`COMPUTERNAME`, with `root` and `dev` fallbacks.

Shell launchers: POSIX `/bin/sh -lc`; Windows try `pwsh -NoLogo -NoProfile -Command`, then `powershell.exe`, then `cmd.exe /d /s /c`. If a launcher is missing, try the next. Preserve command exit status, stdout, stderr, timeout, and signal information in tool output.

User paths expand a leading `~`, resolve relative to active cwd, and normalize using the platform path module. `cd` must reject nonexistent paths and non-directories with a shell-like error.

AGENTS discovery loads `$HOME/AGENTS.md` plus current cwd and each parent from least-specific to most-specific. Read each real file once, avoid duplicate symlink targets, and join contents in order. A missing file is normal.
