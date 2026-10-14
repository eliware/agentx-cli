import { describe, expect, jest, test } from "@jest/globals";
import { isSetupDirectInvocation, runSetupCli } from "../src/setup-entrypoint.mjs";
await import("../test-fixtures/agentx-setup-suite.mjs");

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
