# Web GUI (experimental)

AgentX includes a browser UI served by `agentx-gui.mjs` and `npm run start:gui`. That setup is mainly for repository-local development; global installs are meant for the CLI plus `agentx-setup`.
It uses a local Express server plus a WebSocket connection for live chat updates.

This GUI is only a proof of concept right now. A lot of things are broken, some flows are incomplete, and the CLI remains the primary supported interface.
If you need local configuration or service management, use `agentx-setup`.

## Start it

```bash
npm run start:gui
```

By default it listens on `0.0.0.0:3100`, or the `HOST` and `PORT` values from your environment.

## Login and session state

- Log in with a local Linux username and password.
- The browser can remember GUI credentials and session state in localStorage.
- The GUI keeps its own browser-side state; the terminal `.agentx_responseid` file still applies to the CLI.

## Build assets

```bash
npm run build
```

That writes the bundled frontend assets to `public/dist/`.
