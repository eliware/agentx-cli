import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { runSetupCli } from "./setup-cli-actions.mjs";

export function isSetupDirectInvocation(invokedPath, entrypointPath, launcherPath) {
  return invokedPath === entrypointPath || invokedPath === launcherPath;
}

const invokedPath = process.argv[1] ? fs.realpathSync(process.argv[1]) : "";
const entrypointPath = fs.realpathSync(fileURLToPath(import.meta.url));
const launcherPath = fs.realpathSync(new URL("../bin/agentx-setup.mjs", import.meta.url));

if (isSetupDirectInvocation(invokedPath, entrypointPath, launcherPath))
  await runSetupCli(process.argv.slice(2));
