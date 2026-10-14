import { describe, expect, jest, test } from "@jest/globals";
import { runEntrypointAction } from "../src/agent-entrypoint-actions.mjs";

describe("agent entrypoint actions", () => {
  test.each([
    [{ help: true }, "help text", 0],
    [{ version: true }, "12.0.0", 0],
  ])("prints action output", (flags, output, code) => {
    const stdout = { write: jest.fn() };
    const processRef = { cwd: () => "/work", exit: jest.fn() };
    const dependencies = {
      formatQuickHelp: () => "help text",
      getPackageVersion: () => "12.0.0",
      formatMcpConfigValidation: jest.fn(),
      validateMcpConfigFile: jest.fn(),
    };
    expect(runEntrypointAction({ flags }, { stdout, processRef, dependencies })).toBe(true);
    expect(stdout.write).toHaveBeenCalledWith(`${output}\n`);
    expect(processRef.exit).toHaveBeenCalledWith(code);
  });

  test("validates MCP config and returns false for startup", () => {
    const stdout = { write: jest.fn() };
    const processRef = { cwd: () => "/work", exit: jest.fn() };
    const dependencies = {
      formatQuickHelp: jest.fn(),
      getPackageVersion: jest.fn(),
      formatMcpConfigValidation: () => "invalid",
      validateMcpConfigFile: jest.fn(() => ({ valid: false })),
    };
    expect(
      runEntrypointAction(
        { flags: { checkMcp: true } },
        { homeDirectory: "/config", stdout, processRef, dependencies },
      ),
    ).toBe(true);
    expect(dependencies.validateMcpConfigFile).toHaveBeenCalledWith(
      expect.stringContaining(".agentx.mcp.json"),
    );
    expect(processRef.exit).toHaveBeenCalledWith(1);
    expect(runEntrypointAction({ flags: {} }, { stdout, processRef, dependencies })).toBe(false);
  });

  test("uses the process directory and exits successfully for a valid MCP file", () => {
    const stdout = { write: jest.fn() };
    const processRef = { cwd: () => "/work", exit: jest.fn() };
    const dependencies = {
      formatQuickHelp: jest.fn(),
      getPackageVersion: jest.fn(),
      formatMcpConfigValidation: () => "valid",
      validateMcpConfigFile: jest.fn(() => ({ valid: true })),
    };
    expect(
      runEntrypointAction({ flags: { checkMcp: true } }, { stdout, processRef, dependencies }),
    ).toBe(true);
    expect(dependencies.validateMcpConfigFile).toHaveBeenCalledWith(
      expect.stringMatching(/[\\/]work[\\/].agentx.mcp.json$/),
    );
    expect(processRef.exit).toHaveBeenCalledWith(0);
  });
});
