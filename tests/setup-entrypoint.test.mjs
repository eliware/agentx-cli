import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import path from "node:path";
import { isSetupDirectInvocation } from "../src/setup-entrypoint.mjs";

describe("agentx-setup entrypoint", () => {
  const entrypointPath = path.resolve("src/setup-entrypoint.mjs");
  let originalArgv;
  let originalExit;
  let originalStderrWrite;
  let originalStdoutWrite;

  beforeEach(() => {
    jest.resetModules();
    originalArgv = [...process.argv];
    originalExit = process.exit;
    originalStderrWrite = process.stderr.write;
    originalStdoutWrite = process.stdout.write;
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exit = originalExit;
    process.stderr.write = originalStderrWrite;
    process.stdout.write = originalStdoutWrite;
  });

  test("matches either public invocation path", () => {
    expect(isSetupDirectInvocation("root", "root", "bin")).toBe(true);
    expect(isSetupDirectInvocation("bin", "root", "bin")).toBe(true);
    expect(isSetupDirectInvocation("other", "root", "bin")).toBe(false);
  });

  test("does not start setup when imported indirectly", async () => {
    const runSetup = jest.fn();
    await jest.unstable_mockModule("../src/setup.mjs", () => ({ runSetup }));

    await import("../bin/agentx-setup.mjs");

    expect(runSetup).not.toHaveBeenCalled();
  });

  test("skips startup when no entrypoint argv is present", async () => {
    const runSetup = jest.fn();
    await jest.unstable_mockModule("../src/setup.mjs", () => ({ runSetup }));
    process.argv = [process.argv[0]];

    await import("../bin/agentx-setup.mjs");

    expect(runSetup).not.toHaveBeenCalled();
  });

  test("invokes setup when run as the entrypoint", async () => {
    const runSetup = jest.fn().mockResolvedValue(undefined);
    await jest.unstable_mockModule("node:fs", () => ({
      default: { realpathSync: () => entrypointPath },
      realpathSync: () => entrypointPath,
      readFileSync: () => JSON.stringify({ version: "test-version" }),
    }));
    await jest.unstable_mockModule("../src/setup.mjs", () => ({ runSetup }));
    process.argv = [...process.argv.slice(0, 1), entrypointPath];

    await import("../bin/agentx-setup.mjs");

    expect(runSetup).toHaveBeenCalledWith({ cwd: process.cwd() });
  });

  test("prints setup help when invoked through the package launcher", async () => {
    const launcherPath = path.resolve("bin/agentx-setup.mjs");
    const writes = [];
    process.stdout.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };
    await jest.unstable_mockModule("node:fs", () => ({
      default: {
        realpathSync: (value) =>
          String(value).replaceAll("\\", "/").endsWith("/bin/agentx-setup.mjs")
            ? launcherPath
            : entrypointPath,
      },
      realpathSync: (value) =>
        String(value).replaceAll("\\", "/").endsWith("/bin/agentx-setup.mjs")
          ? launcherPath
          : entrypointPath,
      readFileSync: () => JSON.stringify({ version: "test-version" }),
    }));
    await jest.unstable_mockModule("../src/setup.mjs", () => ({ runSetup: jest.fn() }));
    await jest.unstable_mockModule("../src/cli-version.mjs", () => ({
      getPackageVersion: () => "test-version",
    }));
    process.argv = [...process.argv.slice(0, 1), launcherPath, "--help"];

    await import("../bin/agentx-setup.mjs");

    expect(writes.join("")).toContain("Usage: agentx-setup");
  });

  test("prints setup errors and exits non-zero", async () => {
    const runSetup = jest.fn().mockRejectedValue({ toString: () => "fallback error" });
    const writes = [];
    process.stderr.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };
    process.exit = jest.fn();
    await jest.unstable_mockModule("node:fs", () => ({
      default: { realpathSync: () => entrypointPath },
      realpathSync: () => entrypointPath,
      readFileSync: () => JSON.stringify({ version: "test-version" }),
    }));
    await jest.unstable_mockModule("../src/setup.mjs", () => ({ runSetup }));
    process.argv = [...process.argv.slice(0, 1), entrypointPath];

    await import("../bin/agentx-setup.mjs");

    expect(writes.join("")).toContain("fallback error");
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
