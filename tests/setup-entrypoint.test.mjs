import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import path from "node:path";
import { isSetupDirectInvocation, runSetupCli } from "../src/setup-entrypoint.mjs";

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
describe("setup entrypoint", () => {
  test("matches either public invocation path", () => {
    expect(isSetupDirectInvocation("root", "root", "bin")).toBe(true);
    expect(isSetupDirectInvocation("bin", "root", "bin")).toBe(true);
    expect(isSetupDirectInvocation("other", "root", "bin")).toBe(false);
  });

  test("prints help and version without setup", async () => {
    const stdout = { write: jest.fn() };
    const setup = jest.fn();
    await runSetupCli(["--help"], { stdout, setup, version: () => "12.0.0" });
    await runSetupCli(["--version"], { stdout, setup, version: () => "12.0.0" });
    expect(stdout.write).toHaveBeenNthCalledWith(1, expect.stringContaining("Usage: agentx-setup"));
    expect(stdout.write).toHaveBeenNthCalledWith(2, "12.0.0\n");
    expect(setup).not.toHaveBeenCalled();
    const write = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runSetupCli(["-v"], { version: () => "12.0.0" });
    expect(write).toHaveBeenCalledWith("12.0.0\n");
    write.mockRestore();
  });

  test("runs setup and reports setup errors", async () => {
    const setup = jest.fn();
    await runSetupCli([], { setup, cwd: "project" });
    expect(setup).toHaveBeenCalledWith({ cwd: "project" });
    const stderr = { write: jest.fn() };
    const exit = jest.fn();
    await runSetupCli([], {
      setup: async () => {
        throw new Error("failed");
      },
      stderr,
      exit,
    });
    expect(stderr.write).toHaveBeenCalledWith("failed\n");
    expect(exit).toHaveBeenCalledWith(1);
    await runSetupCli([], {
      setup: async () => {
        throw "failed";
      },
      stderr,
      exit,
    });
    expect(stderr.write).toHaveBeenLastCalledWith("failed\n");
  });
});
