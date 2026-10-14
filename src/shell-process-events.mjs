export function attachShellProcessEvents(child, handlers) {
  child.on("error", handlers.error);
  child.stdout?.on("data", handlers.stdout);
  child.stderr?.on("data", handlers.stderr);
  child.on("close", handlers.close);
}
