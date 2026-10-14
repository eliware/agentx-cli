export function reportEntrypointError(error, processRef = process) {
  processRef.stderr.write(`${error?.message || String(error)}\n`);
  processRef.exitCode = 1;
}
