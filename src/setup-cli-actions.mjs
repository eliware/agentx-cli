import { getPackageVersion } from "./cli-version.mjs";
import { runSetup } from "./setup.mjs";

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
