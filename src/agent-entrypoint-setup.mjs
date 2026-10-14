import { acceptsSetupAnswer, isSetupEligible } from "./agent-entrypoint-setup-policy.mjs";
import { createEntrypointSetupAdapters } from "./agent-entrypoint-setup-adapters.mjs";

export async function confirmSetup({
  isTest,
  isTty,
  configured,
  hasApiKey,
  ask,
  runSetup,
  reloadConfiguration,
}) {
  if (!isSetupEligible({ isTest, isTty, configured, hasApiKey })) return false;
  if (!acceptsSetupAnswer(await ask())) return false;
  await runSetup();
  await reloadConfiguration();
  return hasApiKey();
}

export async function runEntrypointSetup({
  homeDirectory,
  processRef = process,
  dependencies = {},
} = {}) {
  const adapters = createEntrypointSetupAdapters({ homeDirectory, processRef, dependencies });
  return confirmSetup({
    isTest: processRef.env.NODE_ENV === "test",
    isTty: Boolean(processRef.stdin.isTTY && processRef.stdout.isTTY),
    configured: adapters.configured,
    hasApiKey: () => Boolean(processRef.env.agentx_api_key || processRef.env.AGENTX_API_KEY),
    ask: adapters.ask,
    runSetup: adapters.runSetup,
    reloadConfiguration: adapters.reloadConfiguration,
  });
}
