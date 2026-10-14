import { reportEntrypointError } from "./agent-entrypoint-error.mjs";
import { loadAgentEntrypointDependencies } from "./agent-entrypoint-dependencies.mjs";

export async function bootstrapAgentEntrypoint({
  homeDirectory,
  moduleUrl,
  argv = process.argv.slice(2),
  processRef = process,
  dependencies,
} = {}) {
  const services = dependencies || (await loadAgentEntrypointDependencies());
  if (!services.isDirectInvocation(moduleUrl)) return;
  const parsed = services.parseCliArgs(argv);
  const handled = services.runEntrypointAction(parsed, {
    homeDirectory,
    stdout: processRef.stdout,
    processRef,
    dependencies: services,
  });
  if (handled) return;
  try {
    const { cwd, messageArgs } = await services.prepareAgentStartup(parsed, {
      cwd: processRef.cwd(),
    });
    if (!messageArgs.length) await services.runEntrypointSetup({ homeDirectory, processRef });
    await services.runAgent({
      promptPath: services.promptPath,
      cwd,
      flags: parsed.flags,
      ...(messageArgs.length ? { initialMessage: messageArgs.join(" "), oneShot: true } : {}),
    });
  } catch (error) {
    reportEntrypointError(error, processRef);
  }
}
