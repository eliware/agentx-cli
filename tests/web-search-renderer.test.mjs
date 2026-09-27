import { describe, expect, jest, test } from "@jest/globals";
import {
  createWebSearchRenderer,
  formatWebSearchCompletion,
} from "../src/agent-turn/web-search-renderer.mjs";

describe("web search renderer", () => {
  test("renders in-progress and searching status messages", () => {
    const write = jest.fn();
    const status = { showExecuting: jest.fn(), pause: jest.fn() };
    const renderer = createWebSearchRenderer(status, write);
    renderer.start();
    renderer.searching();
    expect(status.showExecuting).toHaveBeenCalledWith(0, 0, { renderNow: false });
    expect(status.pause).toHaveBeenCalled();
    expect(write.mock.calls.join("")).toContain('"web_search":"in_progress"');
    expect(write.mock.calls.join("")).toContain('"web_search":"searching"');
  });

  test("formats filtered queries and source URLs", () => {
    const line = formatWebSearchCompletion({
      action: { queries: ["q", "", 2], sources: [{ url: "https://x.test" }, "plain", ""] },
    });
    expect(line).toContain('"queries": [\n    "q",\n    "2"');
    expect(line).toContain("https://x.test");
    expect(line).toContain("plain");
    expect(formatWebSearchCompletion({ action: {} })).toBe("");
    expect(formatWebSearchCompletion({})).toBe("");
  });

  test("finishes only when there is completion detail and a status controller", () => {
    const write = jest.fn();
    const status = { showReasoning: jest.fn(), resume: jest.fn() };
    const renderer = createWebSearchRenderer(status, write);
    renderer.finish({ action: {} });
    expect(write).not.toHaveBeenCalled();
    renderer.finish({ action: { queries: ["q"] } });
    expect(status.showReasoning).toHaveBeenCalledWith({ renderNow: false });
    expect(status.resume).toHaveBeenCalled();
    expect(write.mock.calls.join("")).toContain('"web_search": "complete"');
  });

  test("suppresses start and completion output when no status controller exists", () => {
    const write = jest.fn();
    const renderer = createWebSearchRenderer(undefined, write);
    renderer.start();
    renderer.finish({ action: { queries: ["q"] } });
    renderer.searching();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(expect.stringContaining('"web_search":"searching"'));
  });
});
