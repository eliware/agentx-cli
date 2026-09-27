import { describe, expect, test } from "@jest/globals";
import { buildMenuEntries, DEFAULTS, renderScreen } from "../src/setup-presentation.mjs";
import { setupPaths } from "../src/setup-paths.mjs";

class Output {
  text = "";
  write(value) {
    this.text += value;
  }
}

describe("setup presentation", () => {
  test("builds compact and settings menus from current values and defaults", () => {
    expect(DEFAULTS.AGENTX_MODEL).toBe("gpt-6-luna");
    expect(buildMenuEntries({ values: { AGENTX_API_KEY: "key" } })).toEqual([
      { id: "api", label: "Edit API key (set)" },
      { id: "quit", label: "Quit" },
    ]);
    expect(buildMenuEntries({ values: { AGENTX_API_KEY: "" } })[0].label).toContain("blank");

    const full = buildMenuEntries({
      values: { AGENTX_API_KEY: "key", AGENTX_MODEL: "custom-model" },
      includeSettings: true,
    });
    expect(full.map(({ id }) => id)).toEqual([
      "api",
      "model",
      "mode",
      "effort",
      "summary",
      "verbosity",
      "compaction",
      "quit",
    ]);
    expect(full[1].label).toBe("Model (custom-model)");
    expect(buildMenuEntries({ values: { AGENTX_MODEL: "custom-model" } })).toHaveLength(8);
  });

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
});
