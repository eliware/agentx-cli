import { describe, expect, jest, test } from "@jest/globals";
import { executePendingSessionTools } from "../../src/agent/session-pending-executor.mjs";

function createSession(overrides = {}) {
  const session = {
    savedState: { id: "response-pending", pending_tool_calls: [{ id: "call-1" }] },
    outputFlags: {
      quiet: true,
      noUsage: true,
      noTimers: true,
      noColors: true,
      noReasoning: true,
      noShellCalls: true,
      noToolCalls: true,
      noMcpOutput: true,
      noWebsearch: true,
    },
    terminalInput: { isTTY: false },
    oneShot: true,
    yoloEnabled: false,
    getOpenAI: () => ({ name: "client" }),
    getTemplate: () => ({ model: "model" }),
    getCwd: () => "C:/repo",
    getUsage: () => ({ turns: 2 }),
    getDebugEnabled: () => true,
    persistResponseSnapshot: jest.fn(),
    persistToolExecutionState: jest.fn(),
    confirmToolCall: jest.fn(),
    handleImageGeneration: jest.fn(),
    onWorkerComplete: jest.fn(),
    now: () => 123,
    ...overrides,
  };
  return session;
}

describe("pending session tool executor", () => {
  test("builds the resumed tool loop and forwards session accounting callbacks", async () => {
    const totals = { turns: 2 };
    const session = createSession({ getUsage: () => totals });
    const execute = jest.fn(async (...args) => {
      const [, , , , usage, runner, options] = args;
      expect(usage({ inputTokens: 1 })).toBe(totals);
      usage({ inputTokens: 2 }, { skipIncrement: true });
      expect(runner).toBe(runPendingToolCall);
      await options.onViewImage({
        args: { images: [] },
        response: { id: "caller" },
        previousResponseId: "parent",
        baseRequest: { model: "vision-model" },
        cwd: "C:/images",
      });
      options.onWorkerUsage({ turns: 3 });
      await options.onViewImage({ args: {}, response: null, baseRequest: null, cwd: "." });
      expect(options.onWorkerComplete).toBe(session.onWorkerComplete);
      return "tool-loop-result";
    });
    const runPendingToolCall = jest.fn();
    const inspectImage = jest.fn(async (_client, args, { onUsage }) => {
      onUsage(args.images ? { turns: 2 } : {});
    });
    const handleToolCalls = jest.fn(async (...args) => execute(...args));
    const addUsageTotals = jest.fn((target, usage) => {
      target.inputTokens = (target.inputTokens || 0) + (usage.inputTokens || 0);
    });
    const createPendingResponse = jest.fn((savedState) => ({ pending: savedState.id }));

    await expect(
      executePendingSessionTools(runPendingToolCall, session, {
        handleToolCalls,
        inspectImage,
        addUsageTotals,
        createPendingResponse,
      }),
    ).resolves.toBe("tool-loop-result");

    expect(handleToolCalls).toHaveBeenCalledWith(
      { name: "client" },
      { pending: "response-pending" },
      { model: "model" },
      "C:/repo",
      expect.any(Function),
      runPendingToolCall,
      expect.objectContaining({
        liveStreaming: true,
        sessionStartedAt: 123,
        skipInitialUsageAccounting: true,
        suppressStatusOutput: true,
        suppressUsageOutput: true,
        colors: false,
        transitionOnlyStatus: true,
        runToolCall: runPendingToolCall,
        yolo: false,
      }),
    );
    expect(addUsageTotals).toHaveBeenCalledTimes(4);
    expect(totals.turns).toBe(9);
    expect(inspectImage).toHaveBeenCalledWith(
      { name: "client" },
      { images: [] },
      expect.objectContaining({
        cwd: "C:/images",
        responseId: "caller",
        previousResponseId: "parent",
        callerResponse: { id: "caller" },
        model: "vision-model",
        processWorker: true,
      }),
    );
  });

  test("uses default tool-loop utilities when adapters are omitted", async () => {
    const totals = { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 };
    const handleToolCalls = jest.fn(
      async (_client, _response, _template, _cwd, usage, _runner, options) => {
        usage({ inputTokens: 4 });
        options.onWorkerUsage({ turns: 2 });
        return "done";
      },
    );
    const session = createSession({
      outputFlags: { quiet: false, noUsage: false },
      oneShot: false,
      terminalInput: { isTTY: true },
      getUsage: () => totals,
      getDebugEnabled: () => false,
    });
    await expect(executePendingSessionTools(jest.fn(), session, { handleToolCalls })).resolves.toBe(
      "done",
    );
    expect(totals).toMatchObject({ inputTokens: 4, turns: 3 });
    expect(handleToolCalls.mock.calls[0][6]).toMatchObject({
      suppressStatusOutput: false,
      transitionOnlyStatus: false,
    });
  });

  test("loads default adapters when services are omitted", async () => {
    await jest.isolateModulesAsync(async () => {
      const handleToolCalls = jest.fn(async (...args) => {
        args[6].onWorkerUsage({});
        await args[6].onViewImage({ args: {}, cwd: "/images" });
      });
      const inspectImage = jest.fn(async (_client, _args, { onUsage }) => onUsage({}));
      const addUsageTotals = jest.fn();
      await jest.unstable_mockModule("../../src/agent-turn/tool-loop.mjs", () => ({
        handleToolCalls,
      }));
      await jest.unstable_mockModule("../../src/image-inspector.mjs", () => ({ inspectImage }));
      await jest.unstable_mockModule("../../src/response.mjs", () => ({ addUsageTotals }));
      await jest.unstable_mockModule("../../src/agent/pending-response.mjs", () => ({
        createPendingResponse: () => ({}),
      }));
      const { executePendingSessionTools: execute } =
        await import("../../src/agent/session-pending-executor.mjs");
      const totals = { turns: 0 };
      await execute(jest.fn(), createSession({ getUsage: () => totals }));
      expect(totals.turns).toBe(1);
      expect(addUsageTotals).toHaveBeenCalledTimes(2);
      expect(inspectImage).toHaveBeenCalledWith(
        { name: "client" },
        {},
        expect.objectContaining({ cwd: "/images", processWorker: true }),
      );
    });
  });
});
