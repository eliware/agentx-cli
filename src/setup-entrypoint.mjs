import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { getPackageVersion } from "./cli-version.mjs";
import { runSetup } from "./setup.mjs";

export function isSetupDirectInvocation(invokedPath, entrypointPath, launcherPath) {
  return invokedPath === entrypointPath || invokedPath === launcherPath;
}

export async function runSetupCli(
  args,
  {
    stdout = process.stdout,
    stderr = process.stderr,
    setup = runSetup,
    version = getPackageVersion,
    cwd = process.cwd(),
    exit = process.exit,
  } = {},
) {
  if (args.includes("--help") || args.includes("-h")) {
    stdout.write(
      `AgentX Setup ${version()}\nUsage: agentx-setup [--help] [--version]\nConfigure user-local AgentX settings.\n`,
    );
  } else if (args.includes("--version") || args.includes("-v")) {
    stdout.write(`${version()}\n`);
  } else {
    try {
      await setup({ cwd });
    } catch (error) {
      stderr.write(`${error?.message || String(error)}\n`);
      exit(1);
    }
  }
}

const invokedPath = process.argv[1] ? fs.realpathSync(process.argv[1]) : "";
const entrypointPath = fs.realpathSync(fileURLToPath(import.meta.url));
const launcherPath = fs.realpathSync(new URL("../bin/agentx-setup.mjs", import.meta.url));

if (isSetupDirectInvocation(invokedPath, entrypointPath, launcherPath))
  await runSetupCli(process.argv.slice(2));
