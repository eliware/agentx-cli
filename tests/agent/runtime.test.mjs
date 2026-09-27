import { afterEach, beforeEach, describe, expect, jest as testMocks, test } from "@jest/globals";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function makeShellMock() {
  return {
    buildWorkingDirectoryNote: (nextCwd) => `User changed working directory to ${nextCwd}`,
    clearTerminal: testMocks.fn(),
    formatPromptForCwd: (nextCwd) => `[AgentX test@dev:${nextCwd}] `,
    formatFinalUsageMessage: (message) => message,
    formatSystemMessage: (message) => message,
    formatWhiteMessage: (message) => message,
    parseInternalCommand: (message) => {
      if (message === "clear") return { type: "session_clear" };
      if (message === "/clear") return { type: "session_clear" };
      if (message === "/usage") return { type: "usage" };
      if (message === "cd" || message.startsWith("cd "))
        return { type: "cd", target: message.slice(2).trim() };
      if (message === "/exit") return { type: "exit" };
      return null;
    },
    readAgentsFromCwdAndParents: testMocks.fn(async () => ""),
    resolveCdTarget: async (target, activeCwd) => {
      if (target === "missing") {
        throw new Error(`cd: not a directory: ${target}`);
      }
      return path.join(activeCwd, target || "home");
    },
  };
}

function mockShellModules(moduleExports = makeShellMock()) {
  return Promise.all(
    ["shell-commands", "shell-display", "shell-paths", "shell-agents"].map((moduleName) =>
      testMocks.unstable_mockModule(`../../src/${moduleName}.mjs`, () => moduleExports),
    ),
  );
}

describe("agent loop", () => {
  let cwd;
  let promptPath;
  let originalArgv;
  let originalExit;
  let originalStdoutWrite;
  let originalConsoleLog;
  let originalLowerApiKey;
  let originalUpperApiKey;
  let writes;
  let logs;

  beforeEach(() => {
    testMocks.resetModules();
    testMocks.unstable_mockModule("@eliware/openai", () => ({
      createOpenAI: () => ({ responses: { close: testMocks.fn() } }),
    }));
    cwd = mkdtempSync(path.join(os.tmpdir(), "agentx-loop-"));
    promptPath = path.join(cwd, "prompt.json");
    writeFileSync(
      promptPath,
      JSON.stringify({
        model: "test-model",
        input: [
          { role: "developer", content: [{ type: "input_text", text: "base prompt" }] },
          { role: "user", content: [{ type: "input_text", text: "first user message" }] },
        ],
        tools: [],
      }),
    );
    writeFileSync(
      path.join(cwd, ".agentx_responseid"),
      JSON.stringify({
        response_id: "resp-saved",
        usage: { inputTokens: 10, cachedTokens: 2, outputTokens: 5, turns: 3 },
        last_user_message: "what time is it?",
        last_assistant_message: "It is 3pm.",
        pending_cli_transcript: "",
      }),
    );

    originalArgv = [...process.argv];
    process.argv = [...process.argv, "--debug"];

    originalExit = process.exit;
    process.exit = testMocks.fn();

    originalStdoutWrite = process.stdout.write;
    originalLowerApiKey = process.env.agentx_api_key;
    originalUpperApiKey = process.env.AGENTX_API_KEY;
    process.env.agentx_api_key = "test-key";
    delete process.env.AGENTX_API_KEY;
    writes = [];
    process.stdout.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };

    originalConsoleLog = console.log;
    logs = [];
    console.log = (...args) => {
      logs.push(args.map(String).join(" "));
    };
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exit = originalExit;
    process.stdout.write = originalStdoutWrite;
    console.log = originalConsoleLog;
    if (originalLowerApiKey === undefined) delete process.env.agentx_api_key;
    else process.env.agentx_api_key = originalLowerApiKey;
    if (originalUpperApiKey === undefined) delete process.env.AGENTX_API_KEY;
    else process.env.AGENTX_API_KEY = originalUpperApiKey;
    rmSync(cwd, { recursive: true, force: true });
  });

  test("persists the active response id and pending tool calls while tool execution is in flight", async () => {
    const questionQueue = ["clear", "hello", "/exit"];

    await testMocks.unstable_mockModule("node:readline/promises", () => ({
      createInterface: () => ({
        question: async () => questionQueue.shift() ?? "/exit",
        close: testMocks.fn(),
      }),
    }));

    await mockShellModules(makeShellMock());
    await testMocks.unstable_mockModule("../../src/tool-shell.mjs", () => ({
      shellExec: testMocks.fn(),
      executeShellCommand: async () => ({
        stdout: "",
        stderr: "",
        outcome: { type: "exit", exit_code: 0 },
      }),
    }));

    const snapshotOrder = [];
    const persistResponseState = testMocks.fn(async (_path, state) => {
      if (state.response_id === "resp-first") snapshotOrder.push("pending-state-persisted");
    });
    const clearSession = testMocks.fn(async () => {});
    const readSessionState = testMocks.fn(async () => null);
    const extractTextFromResponse = testMocks.fn(() => "final assistant");
    const handleToolCalls = testMocks.fn(async (_openai, response) => {
      snapshotOrder.push("tool-loop");
      return response;
    });

    const sendMessage = testMocks.fn(
      async (
        _openai,
        _template,
        _previousResponseId,
        _userMessage,
        _agentsText,
        _cwd,
        _onResponseUsage,
        _requestOverride,
        streamOptions,
      ) => {
        await streamOptions.onResponseState({
          response: { id: "resp-first" },
          usage: { inputTokens: 4, cachedTokens: 1, outputTokens: 2 },
          pendingToolCalls: [
            { type: "shell_call", call_id: "call-1", action: { commands: ["npm test"] } },
          ],
        });
        return {
          id: "resp-complete",
          output: [{ type: "message", content: [{ type: "output_text", text: "done" }] }],
        };
      },
    );

    await testMocks.unstable_mockModule("../../src/agent-turn/response-service.mjs", () => ({
      clearSession,
      extractTextFromResponse,
      extractUsage: (response) =>
        response?.usage || { inputTokens: 0, cachedTokens: 0, outputTokens: 0 },
      persistResponseState,
      readSessionState,
      handleToolCalls,
      sendMessage,
    }));

    await testMocks.unstable_mockModule("../../src/conversation-state.mjs", () => ({
      clearSession:
        typeof clearSession === "undefined" ? testMocks.fn(async () => {}) : clearSession,
      persistResponseState:
        typeof persistResponseState === "undefined"
          ? testMocks.fn(async () => {})
          : persistResponseState,
      readSessionState:
        typeof readSessionState === "undefined" ? testMocks.fn(async () => null) : readSessionState,
    }));
    await testMocks.unstable_mockModule("../../src/response.mjs", () => ({
      extractTextFromResponse:
        typeof extractTextFromResponse === "undefined"
          ? testMocks.fn(() => "")
          : extractTextFromResponse,
      createUsageTotals: () => ({ inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }),
      addUsageTotals: (totals, usage) => {
        totals.inputTokens += usage.inputTokens || 0;
        totals.cachedTokens += usage.cachedTokens || 0;
        totals.outputTokens += usage.outputTokens || 0;
        return totals;
      },
      formatUsageReport: (value) => JSON.stringify({ turns: String(value.turns ?? 0) }),
      formatTurnUsageReport: () => "",
      extractUsage: () => ({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 }),
    }));
    await testMocks.unstable_mockModule("../../src/agent-turn/tool-loop.mjs", () => ({
      handleToolCalls,
    }));

    await testMocks.unstable_mockModule("../../src/runtime.mjs", () => ({
      deleteOptional: async () => {},
      readOptionalText: async () => null,
      readJson: async () => ({
        model: "test-model",
        input: [
          { role: "developer", content: [{ type: "input_text", text: "base prompt" }] },
          { role: "user", content: [{ type: "input_text", text: "first user message" }] },
        ],
        tools: [],
      }),
    }));

    await testMocks.unstable_mockModule("../../src/text-wrap.mjs", () => ({
      getTerminalWidth: () => 80,
      wrapText: (text) => text,
    }));

    const { runAgent } = await import("../../src/agent/runtime.mjs");
    await runAgent({ promptPath, cwd });

    expect(snapshotOrder).toEqual(["pending-state-persisted", "tool-loop"]);
    expect(
      sendMessage.mock.calls.every(
        ([, , , , , , , , streamOptions]) => streamOptions?.suppressStatusOutput === true,
      ),
    ).toBe(true);
    expect(clearSession).toHaveBeenCalledTimes(1);
  }, 15000);

  test("handles goal questions through the runtime readline flow", async () => {
    const questionQueue = ["/goal investigate the issue", "Proceed", "/exit"];

    await testMocks.unstable_mockModule("node:readline/promises", () => ({
      createInterface: () => ({
        question: async () => questionQueue.shift() ?? "/exit",
        close: testMocks.fn(),
      }),
    }));

    const shellMock = makeShellMock();
    shellMock.parseInternalCommand = (message) =>
      message.startsWith("/goal ")
        ? { type: "goal", goal: message.slice(6) }
        : message === "/exit"
          ? { type: "exit" }
          : null;
    await mockShellModules(shellMock);
    await testMocks.unstable_mockModule("../../src/tool-shell.mjs", () => ({
      shellExec: testMocks.fn(),
      executeShellCommand: async () => ({
        stdout: "",
        stderr: "",
        outcome: { type: "exit", exit_code: 0 },
      }),
    }));

    const persistResponseState = testMocks.fn(async () => {});
    const clearSession = testMocks.fn(async () => {});
    const readSessionState = testMocks.fn(async () => null);
    const extractTextFromResponse = testMocks.fn(() => "goal response");
    const sendMessage = testMocks.fn(async (...args) => {
      const streamOptions = args[8];
      await expect(
        streamOptions.onGoalBlocked({ question: "Need input?", choices: ["Proceed"] }),
      ).resolves.toBe("Proceed");
      return {
        id: "goal-response",
        output: [{ type: "message", content: [{ type: "output_text", text: "goal response" }] }],
      };
    });

    await testMocks.unstable_mockModule("../../src/agent-turn/response-service.mjs", () => ({
      clearSession,
      extractTextFromResponse,
      extractUsage: (response) =>
        response?.usage || { inputTokens: 0, cachedTokens: 0, outputTokens: 0 },
      persistResponseState,
      readSessionState,
      handleToolCalls: testMocks.fn(),
      sendMessage,
    }));
    await testMocks.unstable_mockModule("../../src/conversation-state.mjs", () => ({
      clearSession,
      persistResponseState,
      readSessionState,
    }));
    await testMocks.unstable_mockModule("../../src/response.mjs", () => ({
      extractTextFromResponse,
      createUsageTotals: () => ({ inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }),
      addUsageTotals: (totals, usage) => {
        totals.inputTokens += usage.inputTokens || 0;
        totals.cachedTokens += usage.cachedTokens || 0;
        totals.outputTokens += usage.outputTokens || 0;
        return totals;
      },
      formatUsageReport: (value) => JSON.stringify({ turns: String(value.turns ?? 0) }),
      formatTurnUsageReport: () => "",
      extractUsage: () => ({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 }),
    }));
    await testMocks.unstable_mockModule("../../src/agent-turn/tool-loop.mjs", () => ({
      handleToolCalls: testMocks.fn(),
    }));
    await testMocks.unstable_mockModule("../../src/runtime.mjs", () => ({
      deleteOptional: async () => {},
      readOptionalText: async () => null,
      readJson: async () => ({ model: "test-model", input: [], tools: [] }),
    }));
    await testMocks.unstable_mockModule("../../src/text-wrap.mjs", () => ({
      getTerminalWidth: () => 80,
      wrapText: (text) => text,
    }));

    const { runAgent } = await import("../../src/agent/runtime.mjs");
    await runAgent({ promptPath, cwd });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(persistResponseState).toHaveBeenCalled();
  });

  test("resumes interrupted tool execution when the user confirms", async () => {
    const questionQueue = ["/exit"];

    await testMocks.unstable_mockModule("node:readline/promises", () => ({
      createInterface: () => ({
        question: async () => questionQueue.shift() ?? "/exit",
        close: testMocks.fn(),
      }),
    }));

    await mockShellModules(makeShellMock());
    await testMocks.unstable_mockModule("../../src/tool-shell.mjs", () => ({
      shellExec: testMocks.fn(),
      executeShellCommand: async () => ({
        stdout: "",
        stderr: "",
        outcome: { type: "exit", exit_code: 0 },
      }),
    }));

    const persistResponseState = testMocks.fn(async () => {});
    const clearSession = testMocks.fn(async () => {});
    const readSessionState = testMocks.fn(async () => ({
      response_id: "resp-pending",
      usage: { inputTokens: 10, cachedTokens: 2, outputTokens: 5, turns: 3 },
      last_user_message: "please do something",
      last_assistant_message: "",
      pending_cli_transcript: "",
      pending_tool_calls: [
        { type: "shell_call", call_id: "call-1", action: { commands: ["echo resume"] } },
      ],
    }));
    const extractTextFromResponse = testMocks.fn(() => "final assistant");
    const handleToolCalls = testMocks.fn(
      async (
        _openai,
        response,
        _baseRequest,
        _cwd,
        _onResponseUsage,
        _runToolCallFn,
        streamOptions,
      ) => {
        expect(response.id).toBe("resp-pending");
        expect(response.output).toHaveLength(1);
        expect(streamOptions.skipInitialUsageAccounting).toBe(true);
        return {
          id: "resp-complete",
          output: [{ type: "message", content: [{ type: "output_text", text: "done" }] }],
        };
      },
    );

    await testMocks.unstable_mockModule("../../src/agent-turn/response-service.mjs", () => ({
      clearSession,
      extractTextFromResponse,
      handleToolCalls,
      extractUsage: (response) =>
        response?.usage || { inputTokens: 0, cachedTokens: 0, outputTokens: 0 },
      persistResponseState,
      readSessionState,
      sendMessage: testMocks.fn(),
    }));

    await testMocks.unstable_mockModule("../../src/conversation-state.mjs", () => ({
      clearSession:
        typeof clearSession === "undefined" ? testMocks.fn(async () => {}) : clearSession,
      persistResponseState:
        typeof persistResponseState === "undefined"
          ? testMocks.fn(async () => {})
          : persistResponseState,
      readSessionState:
        typeof readSessionState === "undefined" ? testMocks.fn(async () => null) : readSessionState,
    }));
    await testMocks.unstable_mockModule("../../src/response.mjs", () => ({
      extractTextFromResponse:
        typeof extractTextFromResponse === "undefined"
          ? testMocks.fn(() => "")
          : extractTextFromResponse,
      createUsageTotals: () => ({ inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }),
      addUsageTotals: (totals, usage) => {
        totals.inputTokens += usage.inputTokens || 0;
        totals.cachedTokens += usage.cachedTokens || 0;
        totals.outputTokens += usage.outputTokens || 0;
        return totals;
      },
      formatUsageReport: (value) => JSON.stringify({ turns: String(value.turns ?? 0) }),
      formatTurnUsageReport: () => "",
      extractUsage: () => ({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 }),
    }));
    await testMocks.unstable_mockModule("../../src/agent-turn/tool-loop.mjs", () => ({
      handleToolCalls:
        typeof handleToolCalls === "undefined"
          ? testMocks.fn(async (_openai, response) => response)
          : handleToolCalls,
    }));

    await testMocks.unstable_mockModule("../../src/runtime.mjs", () => ({
      deleteOptional: async () => {},
      readOptionalText: async () => null,
      readJson: async () => ({
        model: "test-model",
        input: [
          { role: "developer", content: [{ type: "input_text", text: "base prompt" }] },
          { role: "user", content: [{ type: "input_text", text: "first user message" }] },
        ],
        tools: [],
      }),
    }));

    await testMocks.unstable_mockModule("../../src/text-wrap.mjs", () => ({
      getTerminalWidth: () => 80,
      wrapText: (text) => text,
    }));

    const { runAgent } = await import("../../src/agent/runtime.mjs");
    await runAgent({ promptPath, cwd });

    expect(handleToolCalls).toHaveBeenCalledTimes(1);
    expect(clearSession).not.toHaveBeenCalled();
    expect(persistResponseState.mock.calls.at(-1)[1]).toMatchObject({
      response_id: "resp-complete",
      pending_tool_calls: [],
      last_assistant_message: "final assistant",
    });
    expect(writes.join(" ")).toContain("Resuming pending tool execution");
  });

  test.each([
    {
      label: "option 1",
      resumeChoice: "interrupt-retry",
      statusLine: "Resuming pending tool execution with retry hint",
    },
    {
      label: "option 2",
      resumeChoice: "interrupt-request",
      statusLine: "Resuming pending tool execution with interruption notice",
    },
  ])(
    "resumes interrupted tool execution without re-running pending shell calls for $label",
    async ({ resumeChoice, statusLine }) => {
      const questionQueue = ["/exit"];

      await testMocks.unstable_mockModule("node:readline/promises", () => ({
        createInterface: () => ({
          question: async () => questionQueue.shift() ?? "/exit",
          close: testMocks.fn(),
        }),
      }));

      await testMocks.unstable_mockModule("../../src/resume-menu.mjs", () => ({
        promptResumeMenu: testMocks.fn(async () => resumeChoice),
      }));

      await mockShellModules(makeShellMock());
      const shellExec = testMocks.fn();
      await testMocks.unstable_mockModule("../../src/tool-shell.mjs", () => ({
        shellExec,
        executeShellCommand: async () => ({
          stdout: "",
          stderr: "",
          outcome: { type: "exit", exit_code: 0 },
        }),
      }));

      const persistResponseState = testMocks.fn(async () => {});
      const clearSession = testMocks.fn(async () => {});
      const readSessionState = testMocks.fn(async () => ({
        response_id: "resp-pending",
        usage: { inputTokens: 10, cachedTokens: 2, outputTokens: 5, turns: 3 },
        last_user_message: "please do something",
        last_assistant_message: "",
        pending_cli_transcript: "",
        pending_tool_calls: [
          { type: "shell_call", call_id: "call-1", action: { commands: ["echo resume"] } },
        ],
      }));
      const extractTextFromResponse = testMocks.fn(() => "final assistant");
      const handleToolCalls = testMocks.fn(
        async (
          _openai,
          response,
          _baseRequest,
          _cwd,
          _onResponseUsage,
          runToolCallFn,
          streamOptions,
        ) => {
          expect(response.id).toBe("resp-pending");
          expect(response.output).toHaveLength(1);
          expect(streamOptions.skipInitialUsageAccounting).toBe(true);
          const output = await runToolCallFn(response.output[0], cwd, {
            isFirstResponse: false,
            currentResponse: response,
          });
          expect(output.output[0].stdout).toMatch(/previous transaction was interrupted/iu);
          return {
            id: "resp-complete",
            output: [{ type: "message", content: [{ type: "output_text", text: "done" }] }],
          };
        },
      );

      await testMocks.unstable_mockModule("../../src/agent-turn/response-service.mjs", () => ({
        clearSession,
        extractTextFromResponse,
        handleToolCalls,
        extractUsage: (response) =>
          response?.usage || { inputTokens: 0, cachedTokens: 0, outputTokens: 0 },
        persistResponseState,
        readSessionState,
        sendMessage: testMocks.fn(),
      }));

      await testMocks.unstable_mockModule("../../src/conversation-state.mjs", () => ({
        clearSession:
          typeof clearSession === "undefined" ? testMocks.fn(async () => {}) : clearSession,
        persistResponseState:
          typeof persistResponseState === "undefined"
            ? testMocks.fn(async () => {})
            : persistResponseState,
        readSessionState:
          typeof readSessionState === "undefined"
            ? testMocks.fn(async () => null)
            : readSessionState,
      }));
      await testMocks.unstable_mockModule("../../src/response.mjs", () => ({
        extractTextFromResponse:
          typeof extractTextFromResponse === "undefined"
            ? testMocks.fn(() => "")
            : extractTextFromResponse,
        createUsageTotals: () => ({ inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }),
        addUsageTotals: (totals, usage) => {
          totals.inputTokens += usage.inputTokens || 0;
          totals.cachedTokens += usage.cachedTokens || 0;
          totals.outputTokens += usage.outputTokens || 0;
          return totals;
        },
        formatUsageReport: (value) => JSON.stringify({ turns: String(value.turns ?? 0) }),
        formatTurnUsageReport: () => "",
        extractUsage: () => ({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 }),
      }));
      await testMocks.unstable_mockModule("../../src/agent-turn/tool-loop.mjs", () => ({
        handleToolCalls:
          typeof handleToolCalls === "undefined"
            ? testMocks.fn(async (_openai, response) => response)
            : handleToolCalls,
      }));

      await testMocks.unstable_mockModule("../../src/runtime.mjs", () => ({
        deleteOptional: async () => {},
        readOptionalText: async () => null,
        readJson: async () => ({
          model: "test-model",
          input: [
            { role: "developer", content: [{ type: "input_text", text: "base prompt" }] },
            { role: "user", content: [{ type: "input_text", text: "first user message" }] },
          ],
          tools: [],
        }),
      }));

      await testMocks.unstable_mockModule("../../src/text-wrap.mjs", () => ({
        getTerminalWidth: () => 80,
        wrapText: (text) => text,
      }));

      const { runAgent } = await import("../../src/agent/runtime.mjs");
      await runAgent({ promptPath, cwd });

      expect(shellExec).not.toHaveBeenCalled();
      expect(handleToolCalls).toHaveBeenCalledTimes(1);
      expect(writes.join(" ")).toContain(statusLine);
    },
  );

  test("retries a turn without previous_response_id when the prior response is missing", async () => {
    const questionQueue = ["hello", "/exit"];

    await testMocks.unstable_mockModule("node:readline/promises", () => ({
      createInterface: () => ({
        question: async () => questionQueue.shift() ?? "/exit",
        close: testMocks.fn(),
      }),
    }));

    await mockShellModules(makeShellMock());
    await testMocks.unstable_mockModule("../../src/tool-shell.mjs", () => ({
      shellExec: testMocks.fn(),
      executeShellCommand: async () => ({
        stdout: "",
        stderr: "",
        outcome: { type: "exit", exit_code: 0 },
      }),
    }));

    const persistResponseState = testMocks.fn(async () => {});
    const clearSession = testMocks.fn(async () => {});
    const readSessionState = testMocks.fn(async () => ({
      response_id: "resp-saved",
      usage: { inputTokens: 1, cachedTokens: 0, outputTokens: 1, turns: 1 },
      last_user_message: "hello",
      last_assistant_message: "hi",
      pending_cli_transcript: "",
    }));
    const extractTextFromResponse = testMocks.fn(() => "assistant reply");
    const sendMessage = testMocks
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("Previous response missing"), {
          code: "previous_response_not_found",
        }),
      )
      .mockResolvedValueOnce({
        id: "resp-new",
        output: [{ type: "message", content: [{ type: "output_text", text: "recovered" }] }],
        usage: { input_tokens: 2, input_tokens_details: { cached_tokens: 0 }, output_tokens: 2 },
      });

    await testMocks.unstable_mockModule("../../src/agent-turn/response-service.mjs", () => ({
      clearSession,
      extractTextFromResponse,
      extractUsage: (response) =>
        response?.usage || { inputTokens: 0, cachedTokens: 0, outputTokens: 0 },
      persistResponseState,
      readSessionState,
      handleToolCalls: testMocks.fn(),
      sendMessage,
    }));

    await testMocks.unstable_mockModule("../../src/conversation-state.mjs", () => ({
      clearSession:
        typeof clearSession === "undefined" ? testMocks.fn(async () => {}) : clearSession,
      persistResponseState:
        typeof persistResponseState === "undefined"
          ? testMocks.fn(async () => {})
          : persistResponseState,
      readSessionState:
        typeof readSessionState === "undefined" ? testMocks.fn(async () => null) : readSessionState,
    }));
    await testMocks.unstable_mockModule("../../src/response.mjs", () => ({
      extractTextFromResponse:
        typeof extractTextFromResponse === "undefined"
          ? testMocks.fn(() => "")
          : extractTextFromResponse,
      createUsageTotals: () => ({ inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }),
      addUsageTotals: (totals, usage) => {
        totals.inputTokens += usage.inputTokens || 0;
        totals.cachedTokens += usage.cachedTokens || 0;
        totals.outputTokens += usage.outputTokens || 0;
        return totals;
      },
      formatUsageReport: (value) => JSON.stringify({ turns: String(value.turns ?? 0) }),
      formatTurnUsageReport: () => "",
      extractUsage: () => ({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 }),
    }));
    await testMocks.unstable_mockModule("../../src/agent-turn/tool-loop.mjs", () => ({
      handleToolCalls:
        typeof handleToolCalls === "undefined"
          ? testMocks.fn(async (_openai, response) => response)
          : handleToolCalls,
    }));

    await testMocks.unstable_mockModule("../../src/runtime.mjs", () => ({
      deleteOptional: async () => {},
      readOptionalText: async () => null,
      readJson: async () => ({
        model: "test-model",
        input: [
          { role: "developer", content: [{ type: "input_text", text: "base prompt" }] },
          { role: "user", content: [{ type: "input_text", text: "first user message" }] },
        ],
        tools: [],
      }),
    }));

    await testMocks.unstable_mockModule("../../src/text-wrap.mjs", () => ({
      getTerminalWidth: () => 80,
      wrapText: (text) => text,
    }));

    const { runAgent } = await import("../../src/agent/runtime.mjs");
    await runAgent({ promptPath, cwd });

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls[0][2]).toBe("resp-saved");
    expect(sendMessage.mock.calls[1][2]).toBe("");
    expect(writes.join(" ")).toContain("Previous response not found; starting a new chain");
  });

  test("processes commands, handles session resets and runs fresh requests", async () => {
    const questionQueue = [
      "",
      "clear",
      "/usage",
      "cd missing",
      "cd nested",
      "hello",
      "/clear",
      "fresh",
      "/exit",
    ];

    await testMocks.unstable_mockModule("node:readline/promises", () => ({
      createInterface: () => ({
        question: async () => questionQueue.shift() ?? "/exit",
        close: testMocks.fn(),
      }),
    }));

    await mockShellModules(makeShellMock());
    await testMocks.unstable_mockModule("../../src/tool-shell.mjs", () => ({
      shellExec: testMocks.fn(async (command) =>
        command === "ls" ? "one.txt\ntwo.txt" : "pwd /tmp/work",
      ),
      executeShellCommand: async () => ({
        stdout: "",
        stderr: "",
        outcome: { type: "exit", exit_code: 0 },
      }),
    }));

    const persistResponseState = testMocks.fn(async () => {});
    const clearSession = testMocks.fn(async () => {});
    const readSessionState = testMocks.fn(async () => ({
      response_id: "resp-saved",
      usage: { inputTokens: 10, cachedTokens: 2, outputTokens: 5, turns: 3 },
      last_user_message: "what time is it?",
      last_assistant_message: "It is 3pm.",
      pending_tool_calls: [],
      execution_journal: [{ identity: "stale-call", status: "started" }],
      pending_transaction: { base_response_id: "stale-response", request: { input: "stale" } },
      pending_retry_request: { input: "stale" },
      history: [{ response_id: "stale-response" }],
      rollback_backup: [{ response_id: "discarded-response" }],
    }));
    const extractTextFromResponse = testMocks.fn(
      (response) =>
        response?.output
          ?.map?.((item) => item?.content?.map?.((part) => part?.text || "").join("") || "")
          .join("\n") || "",
    );
    const sendMessage = testMocks.fn(
      async (
        _openai,
        _template,
        previousResponseId,
        userMessage,
        agentsText,
        activeCwd,
        onResponseUsage,
        requestOverride,
      ) => {
        if (!previousResponseId) {
          expect(userMessage).toBe("fresh");
          expect(requestOverride.input[0].content[0].text).toContain("base prompt");
          expect(requestOverride.input[0].content[0].text).toContain("AGENTS.md not present");
          expect(requestOverride.input[1].content[0].text).toBe("fresh");
        }

        onResponseUsage({ inputTokens: 3, cachedTokens: 1, outputTokens: 4 });
        return {
          id: previousResponseId ? "resp-fresh" : "resp-fresh",
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: `reply from ${activeCwd}` }],
            },
          ],
          usage: { input_tokens: 3, input_tokens_details: { cached_tokens: 1 }, output_tokens: 4 },
        };
      },
    );

    await testMocks.unstable_mockModule("../../src/agent-turn/response-service.mjs", () => ({
      clearSession,
      extractTextFromResponse,
      extractUsage: (response) =>
        response?.usage || { inputTokens: 0, cachedTokens: 0, outputTokens: 0 },
      persistResponseState,
      readSessionState,
      handleToolCalls: testMocks.fn(),
      sendMessage,
    }));

    const readJson = testMocks.fn(async () => ({
      model: "test-model",
      input: [
        { role: "developer", content: [{ type: "input_text", text: "base prompt" }] },
        { role: "user", content: [{ type: "input_text", text: "first user message" }] },
      ],
      tools: [],
    }));
    await testMocks.unstable_mockModule("../../src/conversation-state.mjs", () => ({
      clearSession:
        typeof clearSession === "undefined" ? testMocks.fn(async () => {}) : clearSession,
      persistResponseState:
        typeof persistResponseState === "undefined"
          ? testMocks.fn(async () => {})
          : persistResponseState,
      readSessionState:
        typeof readSessionState === "undefined" ? testMocks.fn(async () => null) : readSessionState,
    }));
    await testMocks.unstable_mockModule("../../src/response.mjs", () => ({
      extractTextFromResponse:
        typeof extractTextFromResponse === "undefined"
          ? testMocks.fn(() => "")
          : extractTextFromResponse,
      createUsageTotals: () => ({ inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }),
      addUsageTotals: (totals, usage) => {
        totals.inputTokens += usage.inputTokens || 0;
        totals.cachedTokens += usage.cachedTokens || 0;
        totals.outputTokens += usage.outputTokens || 0;
        return totals;
      },
      formatUsageReport: (value) => JSON.stringify({ turns: String(value.turns ?? 0) }),
      formatTurnUsageReport: () => "",
      extractUsage: () => ({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 }),
    }));
    await testMocks.unstable_mockModule("../../src/agent-turn/tool-loop.mjs", () => ({
      handleToolCalls:
        typeof handleToolCalls === "undefined"
          ? testMocks.fn(async (_openai, response) => response)
          : handleToolCalls,
    }));

    await testMocks.unstable_mockModule("../../src/runtime.mjs", () => ({
      deleteOptional: async () => {},
      readOptionalText: async () => null,
      readJson,
    }));

    const terminalWidth = 80;
    await testMocks.unstable_mockModule("../../src/text-wrap.mjs", () => ({
      getTerminalWidth: () => terminalWidth,
      wrapText: (text) => text,
    }));

    const { runAgent } = await import("../../src/agent/runtime.mjs");
    await runAgent({ promptPath, cwd });

    expect(readJson).toHaveBeenCalledWith(promptPath);
    expect(readSessionState).toHaveBeenCalled();
    expect(clearSession).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(persistResponseState).toHaveBeenCalled();
    const savedSession = persistResponseState.mock.calls.findLast(
      ([savedPath]) => savedPath === path.join(cwd, ".agentx_responseid"),
    )[1];
    expect(savedSession).toMatchObject({
      response_id: "resp-fresh",
      execution_journal: [],
      pending_transaction: null,
      pending_retry_request: null,
      history: [{ response_id: "resp-fresh" }],
      rollback_backup: [],
      failed_response: false,
    });
    expect(process.exit).toHaveBeenCalledWith(0);
    expect(logs.some((line) => line.includes("OpenAI request:"))).toBe(false);
    expect(writes.join(" ")).toContain("AGENTS.md not found");
    expect(writes.join(" ")).toContain("Last user message");
    expect(writes.join(" ")).toContain("what time is it?");
    expect(writes.join(" ")).toContain("Last assistant message");
    expect(writes.join(" ")).toContain("It is 3pm.");
  });

  test("runs direct shell commands locally and prepends them to the next AI request", async () => {
    const questionQueue = ["!ls", "!pwd", "hello", "/exit"];

    await testMocks.unstable_mockModule("node:readline/promises", () => ({
      createInterface: () => ({
        question: async () => questionQueue.shift() ?? "/exit",
        close: testMocks.fn(),
      }),
    }));

    await mockShellModules(makeShellMock());
    await testMocks.unstable_mockModule("../../src/tool-shell.mjs", () => ({
      shellExec: testMocks.fn(async (command) => {
        const output = command === "ls" ? "one.txt\ntwo.txt" : "/tmp/work";
        process.stdout.write(`${output}\n`);
        return output;
      }),
      executeShellCommand: async () => ({
        stdout: "",
        stderr: "",
        outcome: { type: "exit", exit_code: 0 },
      }),
    }));

    const persistResponseState = testMocks.fn(async () => {});
    const clearSession = testMocks.fn(async () => {});
    const readSessionState = testMocks.fn(async () => null);
    const extractTextFromResponse = testMocks.fn(() => "assistant reply");
    const sendMessage = testMocks.fn(
      async (
        _openai,
        _template,
        previousResponseId,
        userMessage,
        _agentsText,
        _activeCwd,
        onResponseUsage,
        requestOverride,
      ) => {
        expect(previousResponseId).toBe("");
        expect(userMessage).toContain("hello");
        expect(requestOverride.input[1].content[0].text).toContain("hello");
        onResponseUsage({ inputTokens: 1, cachedTokens: 0, outputTokens: 1 });
        return {
          id: "resp-1",
          output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }],
          usage: { input_tokens: 1, output_tokens: 1 },
        };
      },
    );

    await testMocks.unstable_mockModule("../../src/agent-turn/response-service.mjs", () => ({
      clearSession,
      extractTextFromResponse,
      extractUsage: (response) =>
        response?.usage || { inputTokens: 0, cachedTokens: 0, outputTokens: 0 },
      persistResponseState,
      readSessionState,
      handleToolCalls: testMocks.fn(),
      sendMessage,
    }));

    await testMocks.unstable_mockModule("../../src/conversation-state.mjs", () => ({
      clearSession:
        typeof clearSession === "undefined" ? testMocks.fn(async () => {}) : clearSession,
      persistResponseState:
        typeof persistResponseState === "undefined"
          ? testMocks.fn(async () => {})
          : persistResponseState,
      readSessionState:
        typeof readSessionState === "undefined" ? testMocks.fn(async () => null) : readSessionState,
    }));
    await testMocks.unstable_mockModule("../../src/response.mjs", () => ({
      extractTextFromResponse:
        typeof extractTextFromResponse === "undefined"
          ? testMocks.fn(() => "")
          : extractTextFromResponse,
      createUsageTotals: () => ({ inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }),
      addUsageTotals: (totals, usage) => {
        totals.inputTokens += usage.inputTokens || 0;
        totals.cachedTokens += usage.cachedTokens || 0;
        totals.outputTokens += usage.outputTokens || 0;
        return totals;
      },
      formatUsageReport: (value) => JSON.stringify({ turns: String(value.turns ?? 0) }),
      formatTurnUsageReport: () => "",
      extractUsage: () => ({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 }),
    }));
    await testMocks.unstable_mockModule("../../src/agent-turn/tool-loop.mjs", () => ({
      handleToolCalls:
        typeof handleToolCalls === "undefined"
          ? testMocks.fn(async (_openai, response) => response)
          : handleToolCalls,
    }));

    await testMocks.unstable_mockModule("../../src/runtime.mjs", () => ({
      deleteOptional: async () => {},
      readOptionalText: async () => null,
      readJson: async () => ({
        model: "test-model",
        input: [
          { role: "developer", content: [{ type: "input_text", text: "base prompt" }] },
          { role: "user", content: [{ type: "input_text", text: "first user message" }] },
        ],
        tools: [],
      }),
    }));

    await testMocks.unstable_mockModule("../../src/text-wrap.mjs", () => ({
      getTerminalWidth: () => 80,
      wrapText: (text) => text,
    }));

    const { runAgent } = await import("../../src/agent/runtime.mjs");
    await runAgent({ promptPath, cwd });

    expect(persistResponseState).toHaveBeenCalledTimes(5);
    expect(persistResponseState.mock.calls[0][1]).toMatchObject({
      response_id: "",
    });
    expect(persistResponseState.mock.calls[0][1].pending_cli_transcript).toBeTruthy();
    expect(persistResponseState.mock.calls[1][1]).toMatchObject({
      response_id: "",
    });
    expect(persistResponseState.mock.calls[1][1].pending_cli_transcript).toBeTruthy();
    expect(persistResponseState.mock.calls[2][1]).toMatchObject({
      response_id: "",
      last_user_message: "hello",
    });
    expect(persistResponseState.mock.calls[2][1].pending_cli_transcript).toBeTruthy();
    expect(persistResponseState.mock.calls[3][1]).toMatchObject({
      response_id: "resp-1",
      pending_cli_transcript: "",
    });
    expect(persistResponseState.mock.calls[4][0]).toContain(".agentx_checkpoint");
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const combinedWrites = writes.join("");
    expect(combinedWrites).not.toContain("Running shell command: ls");
    expect(combinedWrites).not.toContain("Running shell command: pwd");
    expect((combinedWrites.match(/one\.txt/g) || []).length).toBe(1);
    expect((combinedWrites.match(/\/tmp\/work/g) || []).length).toBe(1);
  });

  test("exits cleanly when readline aborts", async () => {
    await testMocks.unstable_mockModule("node:readline/promises", () => ({
      createInterface: () => ({
        question: async () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          throw error;
        },
        close: testMocks.fn(),
      }),
    }));

    await mockShellModules(makeShellMock());
    await testMocks.unstable_mockModule("../../src/tool-shell.mjs", () => ({
      shellExec: testMocks.fn(async (command) =>
        command === "ls" ? "one.txt\ntwo.txt" : "pwd /tmp/work",
      ),
      executeShellCommand: async () => ({
        stdout: "",
        stderr: "",
        outcome: { type: "exit", exit_code: 0 },
      }),
    }));

    const noop = testMocks.fn(async () => {});
    await testMocks.unstable_mockModule("../../src/agent-turn/response-service.mjs", () => ({
      clearSession: noop,
      extractTextFromResponse: () => "",
      extractUsage: () => ({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 }),
      persistResponseState: noop,
      readSessionState: async () => null,
      handleToolCalls: noop,
      sendMessage: noop,
    }));

    await testMocks.unstable_mockModule("../../src/conversation-state.mjs", () => ({
      clearSession:
        typeof clearSession === "undefined" ? testMocks.fn(async () => {}) : clearSession,
      persistResponseState:
        typeof persistResponseState === "undefined"
          ? testMocks.fn(async () => {})
          : persistResponseState,
      readSessionState:
        typeof readSessionState === "undefined" ? testMocks.fn(async () => null) : readSessionState,
    }));
    await testMocks.unstable_mockModule("../../src/response.mjs", () => ({
      extractTextFromResponse:
        typeof extractTextFromResponse === "undefined"
          ? testMocks.fn(() => "")
          : extractTextFromResponse,
      createUsageTotals: () => ({ inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }),
      addUsageTotals: (totals, usage) => {
        totals.inputTokens += usage.inputTokens || 0;
        totals.cachedTokens += usage.cachedTokens || 0;
        totals.outputTokens += usage.outputTokens || 0;
        return totals;
      },
      formatUsageReport: (value) => JSON.stringify({ turns: String(value.turns ?? 0) }),
      formatTurnUsageReport: () => "",
      extractUsage: () => ({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 }),
    }));
    await testMocks.unstable_mockModule("../../src/agent-turn/tool-loop.mjs", () => ({
      handleToolCalls:
        typeof handleToolCalls === "undefined"
          ? testMocks.fn(async (_openai, response) => response)
          : handleToolCalls,
    }));

    await testMocks.unstable_mockModule("../../src/runtime.mjs", () => ({
      deleteOptional: async () => {},
      readOptionalText: async () => null,
      readJson: async () => ({
        model: "test-model",
        input: [],
        tools: [],
      }),
    }));

    await testMocks.unstable_mockModule("../../src/text-wrap.mjs", () => ({
      getTerminalWidth: () => 80,
      wrapText: (text) => text,
    }));

    const { runAgent } = await import("../../src/agent/runtime.mjs");
    await runAgent({ promptPath, cwd });

    expect(process.exit).toHaveBeenCalledWith(0);
    expect(writes.join(" ")).toContain("Starting new session");
  });

  test("retries closed websocket requests with a fresh client before succeeding", async () => {
    const sendMessage = testMocks
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("cannot send on a closed WebSocket"), { code: "websocket_closed" }),
      )
      .mockResolvedValueOnce({
        id: "resp-reconnected",
        output: [{ type: "message", content: [{ type: "output_text", text: "reconnected" }] }],
      });
    const recreateOpenAIClient = testMocks.fn(async () => ({
      responses: { close: testMocks.fn() },
    }));
    const waitForWebsocketRetry = testMocks.fn(async () => true);
    const noop = testMocks.fn(async () => {});

    await testMocks.unstable_mockModule("../../src/agent-turn/response-service.mjs", () => ({
      clearSession: noop,
      extractTextFromResponse: () => "reconnected",
      extractUsage: () => ({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 }),
      persistResponseState: noop,
      readSessionState: async () => null,
      handleToolCalls: noop,
      sendMessage,
    }));
    await testMocks.unstable_mockModule("../../src/retry-recovery.mjs", () => ({
      recreateOpenAIClient,
      waitForWebsocketRetry,
    }));
    await testMocks.unstable_mockModule("../../src/conversation-state.mjs", () => ({
      clearSession: noop,
      persistResponseState: noop,
      readSessionState: async () => null,
    }));
    await testMocks.unstable_mockModule("../../src/response.mjs", () => ({
      extractTextFromResponse: () => "reconnected",
      createUsageTotals: () => ({ inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }),
      addUsageTotals: noop,
      formatUsageReport: () => "",
      formatTurnUsageReport: () => "",
      extractUsage: () => ({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 }),
    }));
    await testMocks.unstable_mockModule("../../src/agent-turn/tool-loop.mjs", () => ({
      handleToolCalls: noop,
    }));
    await testMocks.unstable_mockModule("../../src/runtime.mjs", () => ({
      deleteOptional: async () => {},
      readOptionalText: async () => null,
      readJson: async () => ({ model: "test-model", input: [], tools: [] }),
    }));
    await mockShellModules(makeShellMock());
    await testMocks.unstable_mockModule("../../src/tool-shell.mjs", () => ({
      shellExec: noop,
      executeShellCommand: async () => ({
        stdout: "",
        stderr: "",
        outcome: { type: "exit", exit_code: 0 },
      }),
    }));
    await testMocks.unstable_mockModule("../../src/text-wrap.mjs", () => ({
      getTerminalWidth: () => 80,
      wrapText: (text) => text,
    }));

    const { runAgent } = await import("../../src/agent/runtime.mjs");
    await runAgent({ promptPath, cwd, initialMessage: "hello", oneShot: true });

    expect(waitForWebsocketRetry).toHaveBeenCalledWith(expect.any(Number), 0);
    expect(recreateOpenAIClient).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(writes.join(" ")).toContain("Responses connection expired; reconnecting.");
  });

  test("propagates unexpected readline errors", async () => {
    await testMocks.unstable_mockModule("node:readline/promises", () => ({
      createInterface: () => ({
        question: async () => {
          throw new Error("boom");
        },
        close: testMocks.fn(),
      }),
    }));

    await mockShellModules(makeShellMock());
    await testMocks.unstable_mockModule("../../src/tool-shell.mjs", () => ({
      shellExec: testMocks.fn(async (command) =>
        command === "ls" ? "one.txt\ntwo.txt" : "pwd /tmp/work",
      ),
      executeShellCommand: async () => ({
        stdout: "",
        stderr: "",
        outcome: { type: "exit", exit_code: 0 },
      }),
    }));

    const noop = testMocks.fn(async () => {});
    await testMocks.unstable_mockModule("../../src/agent-turn/response-service.mjs", () => ({
      clearSession: noop,
      extractTextFromResponse: () => "",
      extractUsage: () => ({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 }),
      persistResponseState: noop,
      readSessionState: async () => null,
      handleToolCalls: noop,
      sendMessage: noop,
    }));

    await testMocks.unstable_mockModule("../../src/conversation-state.mjs", () => ({
      clearSession:
        typeof clearSession === "undefined" ? testMocks.fn(async () => {}) : clearSession,
      persistResponseState:
        typeof persistResponseState === "undefined"
          ? testMocks.fn(async () => {})
          : persistResponseState,
      readSessionState:
        typeof readSessionState === "undefined" ? testMocks.fn(async () => null) : readSessionState,
    }));
    await testMocks.unstable_mockModule("../../src/response.mjs", () => ({
      extractTextFromResponse:
        typeof extractTextFromResponse === "undefined"
          ? testMocks.fn(() => "")
          : extractTextFromResponse,
      createUsageTotals: () => ({ inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }),
      addUsageTotals: (totals, usage) => {
        totals.inputTokens += usage.inputTokens || 0;
        totals.cachedTokens += usage.cachedTokens || 0;
        totals.outputTokens += usage.outputTokens || 0;
        return totals;
      },
      formatUsageReport: (value) => JSON.stringify({ turns: String(value.turns ?? 0) }),
      formatTurnUsageReport: () => "",
      extractUsage: () => ({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 }),
    }));
    await testMocks.unstable_mockModule("../../src/agent-turn/tool-loop.mjs", () => ({
      handleToolCalls:
        typeof handleToolCalls === "undefined"
          ? testMocks.fn(async (_openai, response) => response)
          : handleToolCalls,
    }));

    await testMocks.unstable_mockModule("../../src/runtime.mjs", () => ({
      deleteOptional: async () => {},
      readOptionalText: async () => null,
      readJson: async () => ({
        model: "test-model",
        input: [],
        tools: [],
      }),
    }));

    await testMocks.unstable_mockModule("../../src/text-wrap.mjs", () => ({
      getTerminalWidth: () => 80,
      wrapText: (text) => text,
    }));

    const { runAgent } = await import("../../src/agent/runtime.mjs");
    await expect(runAgent({ promptPath, cwd })).rejects.toThrow("boom");
  });
});
