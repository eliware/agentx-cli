import { describe, expect, jest, test } from "@jest/globals";
import {
  attachKeypressListener,
  callIfFunction,
  createFrameRenderer,
  getMenuLines,
  RESUME_MENU_OPTIONS,
} from "../src/resume-menu-view.mjs";

describe("resume menu view", () => {
  test("builds menu lines and renders frames", () => {
    const lines = getMenuLines({ response_id: "resp-1" }, 0);
    expect(lines[0]).toContain("resp-1");
    expect(lines[2]).toContain("default");
    expect(RESUME_MENU_OPTIONS).toHaveLength(4);
    const output = { write: jest.fn() };
    const frame = createFrameRenderer(output);
    frame.render(["one", "two"]);
    frame.render(["three"]);
    frame.clear();
    frame.clear();
    expect(output.write).toHaveBeenCalled();
  });

  test("calls optional functions and attaches key listeners", () => {
    const fn = jest.fn();
    expect(callIfFunction(fn, "arg")).toBeUndefined();
    expect(callIfFunction(null)).toBeUndefined();
    expect(fn).toHaveBeenCalledWith("arg");
    const input = { on: jest.fn() };
    const listener = jest.fn();
    attachKeypressListener(input, listener);
    expect(input.on).toHaveBeenCalledWith("keypress", listener);
    attachKeypressListener({}, listener);
  });
});
