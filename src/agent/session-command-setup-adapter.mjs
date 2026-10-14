import { runSessionSetupFlow } from "./session-setup-flow.mjs";

export function createSessionCommandSetupAdapter({ services, repl, context }) {
  return () =>
    runSessionSetupFlow({
      readline: repl.getReadline(),
      preserveHistory: repl.preserveHistory,
      runSetup: services.runSetup,
      reloadTemplate: async () =>
        services.applySettings(
          await services.loadPromptTemplate(context.promptPath, undefined, process.env, {
            loadMcp: !context.outputFlags.noMcp,
          }),
          await services.reloadSettings(),
        ),
      write: services.write,
      formatMessage: services.formatMessage,
      printError: services.printError,
      createReadline: repl.createReadline,
      setReadline: repl.setReadline,
      input: context.input,
      output: context.output,
    });
}
