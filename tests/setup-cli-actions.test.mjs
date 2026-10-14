import { describe, expect, jest, test } from "@jest/globals";
import { runSetupCli } from "../src/setup-cli-actions.mjs";

describe("setup CLI actions", () => {
  test("prints help and version without setup", async () => {
    const stdout = { write: jest.fn() };
    const setup = jest.fn();
    await runSetupCli(["--help"], { stdout, setup, version: () => "12.0.0" });
    await runSetupCli(["--version"], { stdout, setup, version: () => "12.0.0" });
    expect(stdout.write).toHaveBeenNthCalledWith(1, expect.stringContaining("Usage: agentx-setup"));
    expect(stdout.write).toHaveBeenNthCalledWith(2, "12.0.0\n");
    expect(setup).not.toHaveBeenCalled();
  });

  test.each(["-h", "-v"])("accepts the %s alias", async (flag) => {
    const stdout = { write: jest.fn() };
    await runSetupCli([flag], { stdout, setup: jest.fn(), version: () => "12.0.0" });
    expect(stdout.write).toHaveBeenCalledWith(
      flag === "-h" ? expect.stringContaining("Usage: agentx-setup") : "12.0.0\n",
    );
  });

  test("runs setup and reports failures", async () => {
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
