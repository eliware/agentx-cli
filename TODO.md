if user runs agentx.mjs and the $HOME/.agentx file (env file) is missing or unconfigured and ask if the user wants to run agentx-setup now (Y/n)
after setup exits if the file is created and a key is setup then start the app

update the agent-setup menu
allow switching models between gpt-5.6-luna (small) gpt-5.6-terra (medium) and gpt-5.6-sol (large)
implement per-model pricing calculations
allow selectable reasoning mode (standard (default)/pro) and effort (none, low (default), medium, high, xhigh, max)
allow configuring reasoning summary level (concise, detailed, auto (default), null (off))
allow configuring output verbosity (low (default), medium, high)

add a /setup command to run agentx-setup while in the app, and upon exiting the setup app load the new settings while keeping the session going

add jumbo prompt detection in usage calculations for inputs over 272k tokens use 2x price
add handling for streaming reasoning summary output

remove web-server component
- agentx-gui.mjs, agentx-gui.service file, all supporting frontend/backend code and tests
- remove PORT and HOST from .env file
- remove all the webserver install/uninstall stuff from the agentx-setup tool
- remove build command and webpack config

always load $HOME/AGENTS.md if exists
