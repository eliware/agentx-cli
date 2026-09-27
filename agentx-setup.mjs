#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { runSetup } from "./src/setup.mjs";
import { getPackageVersion } from "./src/cli-version.mjs";

const invokedPath = process.argv[1] ? fs.realpathSync(process.argv[1]) : "";
const modulePath = fs.realpathSync(fileURLToPath(import.meta.url));
const launcherPath = fs.realpathSync(new URL("./bin/agentx-setup.mjs", import.meta.url));

if (invokedPath === modulePath || invokedPath === launcherPath) {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(
      `AgentX Setup ${getPackageVersion()}\nUsage: agentx-setup [--help] [--version]\nConfigure user-local AgentX settings.\n`,
    );
  } else if (args.includes("--version") || args.includes("-v")) {
    process.stdout.write(`${getPackageVersion()}\n`);
  } else {
    try {
      await runSetup({ cwd: process.cwd() });
    } catch (error) {
      process.stderr.write(`${error?.message || String(error)}\n`);
      process.exit(1);
    }
  }
}
