import { describe, expect, jest, test } from "@jest/globals";
import { createMcpEventRenderer } from "../src/agent-turn/mcp-event-renderer.mjs";

describe("MCP event renderer", () => {
  test("renders progress variants and status transitions", () => {
    const write = jest.fn();
    const status = { showExecuting: jest.fn(), showReasoning: jest.fn() };
    const renderer = createMcpEventRenderer({ statusController: status, write });
    renderer.handleEvent({ type: "response.mcp_call.in_progress" });
    renderer.handleEvent({ type: "response.mcp_call.progress", progress: "half" });
    renderer.handleEvent({ type: "response.mcp_call.update", progress_update: 2 });
    renderer.handleEvent({ type: "response.mcp_call.progress", message: "message" });
    renderer.handleEvent({ type: "response.mcp_call.progress", data: "data" });
    renderer.handleEvent({ type: "response.mcp_call.progress", payload: "payload" });
    renderer.handleEvent({ type: "response.mcp_call.progress", status: "status" });
    renderer.handleEvent({ type: "response.mcp_call.progress", delta: "delta" });
    renderer.handleEvent({ type: "response.mcp_call.progress" });
    renderer.handleEvent({ type: "response.mcp_call.completed" });
    renderer.handleEvent({ type: "response.mcp_call.failed" });
    renderer.handleEvent({ type: "response.mcp_call.other" });
    expect(write.mock.calls.join("")).toContain('{"mcp":"half"}');
    expect(write.mock.calls.join("")).toContain('{"mcp":"2"}');
    expect(write.mock.calls.join("")).toContain('{"mcp":"delta"}');
    expect(status.showExecuting).toHaveBeenCalledTimes(9);
    expect(status.showReasoning).toHaveBeenCalledTimes(2);
  });

  test("renders MCP arguments and call framing with status callbacks", () => {
    const write = jest.fn();
    const markOutput = jest.fn();
    const status = { pause: jest.fn(), beginWriting: jest.fn(), resume: jest.fn() };
    const renderer = createMcpEventRenderer({ statusController: status, markOutput, write });
    renderer.writeArguments({ delta: '{"url":1}' });
    renderer.writeArguments({ delta: "" });
    renderer.writeArguments({});
    renderer.addCall({ name: "lookup" });
    renderer.addCall({ server_label: "server" });
    renderer.addCall({});
    expect(renderer.finishCall()).toBe("\n");
    expect(write.mock.calls.join("")).toContain("lookup(");
    expect(write.mock.calls.join("")).toContain("server(");
    expect(write.mock.calls.join("")).toContain("mcp_call(");
    expect(markOutput).toHaveBeenCalledTimes(6);
    expect(status.pause).toHaveBeenCalled();
    expect(status.beginWriting).toHaveBeenCalledTimes(3);
    expect(status.resume).toHaveBeenCalledWith({ renderNow: false });
  });

  test("allows optional status and output callbacks", () => {
    const renderer = createMcpEventRenderer({ write: jest.fn() });
    renderer.handleEvent({ type: "response.mcp_call.in_progress" });
    renderer.handleEvent({ type: "response.mcp_call.completed" });
    renderer.writeArguments({ delta: "" });
    renderer.addCall({});
    expect(renderer.finishCall()).toBe("\n");
  });

  test("can be constructed with default options", () => {
    expect(createMcpEventRenderer()).toBeDefined();
  });
});
