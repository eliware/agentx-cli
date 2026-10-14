import { expect, test, jest } from "@jest/globals";
import { createStatusDisplay } from "../../src/agent-turn/status-display.mjs";

test("renders an active phase without colors when configured", () => {
  const write = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    const display = createStatusDisplay({
      quiet: false,
      transitionOnly: true,
      colors: false,
      snapshot: () => ({
        time: "0s",
        reasoning: { active: true, value: "0s/0s" },
        writing: { active: false, value: "0s/0s" },
        executing: { active: false, value: "0s/0s" },
      }),
      getState: () => "reasoning",
      isPaused: () => false,
    });
    display.render();
    expect(write).toHaveBeenCalled();
  } finally {
    write.mockRestore();
  }
});
