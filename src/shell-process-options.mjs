export function createShellSpawnOptions(cwd, platform) {
  return {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    detached: platform !== "win32",
  };
}
