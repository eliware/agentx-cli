import { path } from "@eliware/common";
import { getHomeDirectory } from "./platform.mjs";
import { loadUserConfiguration } from "./env-loader.mjs";

export function loadEntrypointEnvironment({
  homeDirectory = getHomeDirectory(),
  load = loadUserConfiguration,
} = {}) {
  if (homeDirectory) load(path(homeDirectory, ".agentx"));
  return homeDirectory;
}
