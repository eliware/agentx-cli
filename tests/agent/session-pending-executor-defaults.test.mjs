import { describe, expect, jest, test } from "@jest/globals";

const mockToolLoop = jest.fn();
const mockInspectImage = jest.fn();
const mockAddUsageTotals = jest.fn();
await jest.unstable_mockModule("../../src/agent-turn/tool-loop.mjs", () => ({
  handleToolCalls: mockToolLoop,
}));
await jest.unstable_mockModule("../../src/image-inspector.mjs", () => ({
  inspectImage: mockInspectImage,
}));
await jest.unstable_mockModule("../../src/response.mjs", () => ({
  addUsageTotals: mockAddUsageTotals,
}));
const { executePendingSessionTools } = await import("../../src/agent/session-pending-executor.mjs");

describe("pending tool executor default adapters", () => {
  test("uses default services and forwards worker and image accounting", async () => {
    const totals = { turns: 0 };
    const session = {
      savedState: { response_id: "saved", pending_tool_calls: [{ call_id: "call" }] },
      outputFlags: {},
      terminalInput: { isTTY: true },
      oneShot: false,
      yoloEnabled: false,
      getOpenAI: () => "client",
      getTemplate: () => "template",
      getCwd: () => "/repo",
      getUsage: () => totals,
      getDebugEnabled: () => false,
      now: () => 1,
    };
    mockToolLoop.mockImplementationOnce(async (...args) => {
      const usage = args[4];
      const options = args[6];
      expect(args[1]).toEqual({ id: "saved", output: [{ call_id: "call" }] });
      usage({ inputTokens: 1 });
      options.onWorkerUsage({});
      await options.onViewImage({ args: {}, cwd: "/images" });
    });
    mockInspectImage.mockImplementationOnce(async (_client, _args, { onUsage }) => {
      onUsage({});
    });

    await executePendingSessionTools(jest.fn(), session);

    expect(mockAddUsageTotals).toHaveBeenCalledTimes(3);
    expect(totals.turns).toBe(2);
    expect(mockInspectImage).toHaveBeenCalledWith(
      "client",
      {},
      expect.objectContaining({ cwd: "/images", processWorker: true }),
    );
  });
});
