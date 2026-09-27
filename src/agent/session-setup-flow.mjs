export async function runSessionSetupFlow({
  readline,
  preserveHistory,
  runSetup,
  reloadTemplate,
  write,
  printError,
  formatMessage,
  createReadline,
  setReadline,
  input,
  output,
}) {
  preserveHistory();
  readline?.close?.();
  try {
    await runSetup({ stdin: input, stdout: output });
  } catch (error) {
    printError(`Error during setup: ${error?.message || String(error)}`);
  }
  const template = await reloadTemplate();
  write(`${formatMessage("Settings reloaded")}\n`);
  setReadline(createReadline());
  return template;
}
