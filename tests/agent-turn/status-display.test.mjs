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

test("renders colored status once and clears the previous line", () => {
  const write = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    const display = createStatusDisplay({
      quiet: false,
      transitionOnly: false,
      colors: true,
      snapshot: () => ({
        time: "1s",
        reasoning: { active: false, value: "1s/1s" },
        writing: { active: true, value: "1s/1s" },
        executing: { active: false, value: "0s/0s" },
      }),
      getState: () => "reasoning",
      isPaused: () => false,
    });
    display.render();
    display.render();
    expect(write).toHaveBeenCalledTimes(1);
    display.clear();
    expect(write).toHaveBeenLastCalledWith("\r\x1b[2K\r");
    display.clear();
  } finally {
    write.mockRestore();
  }
});

test("clears an uncolored status without a clear sequence", () => {
  const write = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    const display = createStatusDisplay({
      quiet: false,
      transitionOnly: false,
      colors: false,
      snapshot: () => ({
        time: "1s",
        reasoning: { active: false, value: "1s/1s" },
        writing: { active: false, value: "0s/0s" },
        executing: { active: false, value: "0s/0s" },
      }),
      getState: () => "reasoning",
      isPaused: () => false,
    });
    display.render();
    write.mockClear();
    display.clear();
    expect(write).not.toHaveBeenCalled();
  } finally {
    write.mockRestore();
  }
});

test.each(["", "writing", "paused"])("skips a %s status", (state) => {
  const write = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    const display = createStatusDisplay({
      quiet: false,
      transitionOnly: false,
      colors: false,
      snapshot: jest.fn(),
      getState: () => state,
      isPaused: () => state === "paused",
    });
    display.render();
    expect(write).not.toHaveBeenCalled();
  } finally {
    write.mockRestore();
  }
});
