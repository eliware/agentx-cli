import { expect, jest, test } from "@jest/globals";
import { createStatusDisplay } from "../../src/agent-turn/status-display.mjs";

function createDisplay(options = {}) {
  const write = jest.fn();
  const display = createStatusDisplay({
    quiet: false,
    transitionOnly: false,
    colors: false,
    snapshot: () => ({
      time: "0s",
      reasoning: { active: false, value: "0s/0s" },
      writing: { active: false, value: "0s/0s" },
      executing: { active: false, value: "0s/0s" },
    }),
    getState: () => "reasoning",
    isPaused: () => false,
    writeOutput: write,
    ...options,
  });
  return { display, write };
}

test("renders an active phase without colors when configured", () => {
  const { display, write } = createDisplay({ transitionOnly: true });
  display.render();
  expect(write).toHaveBeenCalledWith(
    '{"time":"0s","reasoning":"0s/0s","writing":"0s/0s","executing":"0s/0s"}\n',
  );
});

test("renders colored status once and clears the previous line", () => {
  const { display, write } = createDisplay({
    colors: true,
    snapshot: () => ({
      time: "1s",
      reasoning: { active: false, value: "1s/1s" },
      writing: { active: true, value: "1s/1s" },
      executing: { active: false, value: "0s/0s" },
    }),
  });
  display.render();
  display.render();
  expect(write).toHaveBeenCalledTimes(1);
  expect(write).toHaveBeenCalledWith(
    '\u001b[38;5;255m{"time":"1s","reasoning":"1s/1s",\u001b[32m"writing":"1s/1s"\u001b[38;5;255m,"executing":"0s/0s"}\u001b[0m',
  );
  display.clear();
  expect(write).toHaveBeenLastCalledWith("\r\x1b[2K\r");
  display.clear();
});

test("clears an uncolored status without a clear sequence", () => {
  const { display, write } = createDisplay();
  display.render();
  write.mockClear();
  display.clear();
  expect(write).not.toHaveBeenCalled();
});

test.each(["", "writing", "paused"])("skips a %s status", (state) => {
  const { display, write } = createDisplay({
    snapshot: jest.fn(),
    getState: () => state,
    isPaused: () => state === "paused",
  });
  display.render();
  expect(write).not.toHaveBeenCalled();
});
