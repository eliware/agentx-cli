import { describe, expect, test } from "@jest/globals";
import { buildMenuEntries, DEFAULTS } from "../src/setup-menu-entries.mjs";

describe("setup menu entries", () => {
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
});
