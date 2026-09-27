import { describe, expect, jest, test } from "@jest/globals";
import { createReasoningSummaryRenderer } from "../src/agent-turn/reasoning-summary-renderer.mjs";

describe("reasoning summary renderer", () => {
  test("buffers split headers and writes the rest of the summary", () => {
    const write = jest.fn();
    const status = { pause: jest.fn(), resume: jest.fn() };
    const renderer = createReasoningSummaryRenderer(status, write);
    renderer.writeDelta("before **He");
    expect(write).not.toHaveBeenCalled();
    renderer.writeDelta("ader** after");
    renderer.writeDelta(" more");
    expect(renderer.hasStreamedSummary()).toBe(true);
    expect(write.mock.calls.join("")).toContain("\u001b[4mHeader\u001b[24m");
    expect(write.mock.calls.join("")).toContain(" more");
    expect(status.pause).toHaveBeenCalledTimes(3);
    renderer.finish();
    expect(status.resume).toHaveBeenCalledWith({ renderNow: false });
    expect(write).toHaveBeenLastCalledWith("\n");
  });

  test("flushes an unfinished header buffer on finish", () => {
    const write = jest.fn();
    const renderer = createReasoningSummaryRenderer(undefined, write);
    renderer.writeDelta("unfinished **header");
    renderer.finish();
    expect(write).toHaveBeenCalledWith("\u001b[38;5;230munfinished **header\u001b[0m");
    expect(renderer.hasStreamedSummary()).toBe(true);
  });

  test("ignores empty deltas and finishes without a status controller", () => {
    const write = jest.fn();
    const renderer = createReasoningSummaryRenderer(undefined, write);
    renderer.writeDelta("");
    renderer.writeDelta(null);
    renderer.finish();
    expect(renderer.hasStreamedSummary()).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  test("finishes an empty summary with a status controller", () => {
    const write = jest.fn();
    const status = { resume: jest.fn() };
    createReasoningSummaryRenderer(status, write).finish();
    expect(write).toHaveBeenCalledWith("\n");
    expect(status.resume).toHaveBeenCalledWith({ renderNow: false });
  });
});
