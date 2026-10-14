import { describe, expect, test } from "@jest/globals";
import { renderReadlineMenu, renderScreen } from "../src/setup-presentation.mjs";
import { setupPaths } from "../src/setup-paths.mjs";

class Output {
  text = "";
  write(value) {
    this.text += value;
  }
}

describe("setup presentation", () => {
  test("renders configured or default paths and optional status message", () => {
    const defaults = new Output();
    renderScreen({ values: { AGENTX_API_KEY: "" }, stdout: defaults });
    expect(defaults.text).toContain(`Config File: ${setupPaths.envPath}`);
    expect(defaults.text).toContain(`MCP Config: ${setupPaths.mcpConfigPath}`);
    expect(defaults.text).toContain(`Install Path: ${setupPaths.rootDir}`);
    expect(defaults.text).toContain("API key: blank");
    expect(defaults.text).not.toContain("\nundefined\n");

    const configured = new Output();
    renderScreen({
      values: { AGENTX_API_KEY: "configured" },
      message: "Saved",
      stdout: configured,
      configPath: "/tmp/custom-env",
      mcpPath: "/tmp/custom-mcp",
    });
    expect(configured.text).toContain("Config File: /tmp/custom-env");
    expect(configured.text).toContain("MCP Config: /tmp/custom-mcp");
    expect(configured.text).toContain("API key: set");
    expect(configured.text).toContain("\nSaved\n");
  });

  test("renders the readline fallback with its choices and instructions", () => {
    const output = new Output();
    renderReadlineMenu({
      values: { AGENTX_API_KEY: "key" },
      message: "Unknown option.",
      stdout: output,
      entries: [{ id: "quit", label: "Quit" }],
    });
    expect(output.text).toContain("Unknown option.");
    expect(output.text).toContain("1. Quit");
    expect(output.text).toContain("Use 1-1, ↑/↓, or Enter.");
  });
});
