#!/usr/bin/env node
import { loadEntrypointEnvironment } from "./agent-entrypoint-env.mjs";
import { bootstrapAgentEntrypoint } from "./agent-entrypoint-bootstrap.mjs";

await bootstrapAgentEntrypoint({
  homeDirectory: loadEntrypointEnvironment(),
  moduleUrl: import.meta.url,
});
