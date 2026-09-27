import { describe, expect, jest, test } from "@jest/globals";
import { createSessionPersistence } from "../../src/agent/conversation-persistence.mjs";

function makePersistence({ initialState = {}, oneShot = false } = {}) {
  let state = {
    response_id: "old-response",
    usage: { inputTokens: 2, turns: 1 },
    last_user_message: "user asks something",
    last_assistant_message: "old answer",
    pending_cli_transcript: "",
    pending_tool_calls: [],
    execution_journal: [],
    history: [],
    rollback_backup: [],
    failed_response: false,
    pending_retry_request: null,
    pending_transaction: null,
    goal: null,
    ...initialState,
  };
  const persisted = [];
  const checkpoints = [];
  const operations = [];
  const persistence = createSessionPersistence({
    statePath: "session.json",
    checkpointPath: "checkpoint.json",
    oneShot,
    getState: () => state,
    setState: (nextState) => {
      state = nextState;
      operations.push("state-update");
    },
    persistResponseState: jest.fn(async (path, value) => {
      persisted.push({ path, value });
      operations.push("persist-state");
    }),
    persistCheckpoint: jest.fn(async (path, value) => {
      checkpoints.push({ path, value });
      operations.push("persist-checkpoint");
    }),
    extractAssistantText: (response) => response?.text || "",
  });
  return {
    ...persistence,
    getState: () => state,
    persisted,
    checkpoints,
    operations,
  };
}

describe("agent session persistence coordinator", () => {
  test("persists the current runtime state to the session path", async () => {
    const session = makePersistence({ initialState: { response_id: "latest" } });
    await session.saveState();
    expect(session.persisted).toEqual([{ path: "session.json", value: session.getState() }]);
    expect(session.checkpoints).toEqual([]);
  });

  test("applies pending response snapshots and persists without a checkpoint", async () => {
    const calls = [{ call_id: "call-1" }];
    const session = makePersistence();
    await session.persistResponseSnapshot({ response: { id: "pending" }, pendingToolCalls: calls });
    expect(session.getState()).toMatchObject({
      response_id: "pending",
      pending_tool_calls: calls,
      pending_transaction: { base_response_id: "pending", calls, request: null },
    });
    expect(session.persisted).toHaveLength(1);
    expect(session.checkpoints).toEqual([]);
    expect(session.operations).toEqual(["state-update", "persist-state"]);
  });

  test("writes successful response state before its shared checkpoint", async () => {
    const session = makePersistence();
    await session.persistResponseSnapshot({
      response: { id: "completed", text: "final answer" },
      pendingToolCalls: [],
    });
    expect(session.getState()).toMatchObject({
      response_id: "completed",
      last_assistant_message: "final answer",
      failed_response: false,
      pending_retry_request: null,
      pending_transaction: null,
      history: [{ response_id: "completed", assistant_preview: "final answer" }],
    });
    expect(session.checkpoints).toHaveLength(1);
    expect(session.checkpoints[0]).toMatchObject({
      path: "checkpoint.json",
      value: { response_id: "completed", last_assistant_message: "final answer" },
    });
    expect(session.operations).toEqual(["state-update", "persist-state", "persist-checkpoint"]);
  });

  test("keeps one-shot successful snapshots isolated from shared checkpoints", async () => {
    const session = makePersistence({ oneShot: true });
    await session.persistResponseSnapshot({ response: { id: "one-shot" }, pendingToolCalls: [] });
    expect(session.getState().history).toHaveLength(1);
    expect(session.persisted).toHaveLength(1);
    expect(session.checkpoints).toEqual([]);
  });

  test("uses default extraction and interactive checkpoint behavior", async () => {
    let state = { last_user_message: "hello", usage: {}, history: [], execution_journal: [] };
    const persistCheckpoint = jest.fn();
    const persistence = createSessionPersistence({
      statePath: "state",
      checkpointPath: "checkpoint",
      getState: () => state,
      setState: (nextState) => {
        state = nextState;
      },
      persistResponseState: jest.fn(),
      persistCheckpoint,
    });
    await persistence.persistResponseSnapshot({ response: { id: "default-mode" } });
    expect(persistCheckpoint).toHaveBeenCalledWith(
      "checkpoint",
      expect.objectContaining({ response_id: "default-mode", last_assistant_message: "" }),
    );
    await persistence.persistToolExecutionState({});
    expect(state.execution_journal[0]).toMatchObject({ identity: "id:", response_id: "" });
  });

  test("applies a complete in-memory reset without writing stale state", async () => {
    const session = makePersistence({
      initialState: {
        pending_tool_calls: [{ call_id: "stale-call" }],
        execution_journal: [{ identity: "stale-call", status: "started" }],
        pending_retry_request: { input: "stale" },
        pending_transaction: { base_response_id: "stale" },
        history: [{ response_id: "stale" }],
        rollback_backup: [{ response_id: "discarded" }],
        failed_response: true,
        goal: { status: "active" },
      },
    });
    const emptyUsage = { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 };
    const cleared = session.resetState(emptyUsage);
    expect(cleared).toMatchObject({
      response_id: "",
      usage: emptyUsage,
      pending_tool_calls: [],
      execution_journal: [],
      pending_retry_request: null,
      pending_transaction: null,
      history: [],
      rollback_backup: [],
      failed_response: false,
      goal: null,
    });
    expect(session.getState()).toEqual(cleared);
    expect(session.persisted).toEqual([]);
  });

  test("applies rollback state in memory before persistence is requested", () => {
    const selected = {
      response_id: "selected",
      last_user_message: "selected question",
      last_assistant_message: "selected answer",
      usage: { inputTokens: 7 },
    };
    const session = makePersistence({
      initialState: {
        pending_tool_calls: [{ call_id: "pending" }],
        execution_journal: [{ identity: "pending", status: "started" }],
        pending_retry_request: { input: "retry" },
        pending_transaction: { base_response_id: "pending" },
        pending_cli_transcript: "stale output",
        goal: { status: "active" },
        history: [{ response_id: "selected" }, { response_id: "newer" }],
      },
    });

    const rolledBack = session.applyRollback(selected);
    expect(session.getState()).toEqual(rolledBack);
    expect(rolledBack).toMatchObject({
      response_id: "selected",
      pending_tool_calls: [],
      execution_journal: [],
      pending_retry_request: null,
      pending_transaction: null,
      pending_cli_transcript: "",
      goal: null,
      history: [{ response_id: "selected" }],
      rollback_backup: [{ response_id: "newer" }],
    });
    expect(session.persisted).toEqual([]);
  });

  test("replaces journal records by identity, bounds history, and tolerates missing journal state", async () => {
    const initialJournal = Array.from({ length: 100 }, (_, index) => ({
      identity: `entry-${index}`,
      status: "pending",
    }));
    const session = makePersistence({
      initialState: { execution_journal: initialJournal },
    });
    await session.persistToolExecutionState({
      call: { call_id: "call-1" },
      response: { id: "response-1" },
      status: "started",
      identity: "entry-50",
    });
    expect(session.getState().execution_journal).toHaveLength(100);
    expect(
      session.getState().execution_journal.find(({ identity }) => identity === "entry-50"),
    ).toMatchObject({ status: "started", response_id: "response-1" });

    const withoutJournal = makePersistence({ initialState: { execution_journal: undefined } });
    await withoutJournal.persistToolExecutionState({
      call: { id: "call-2" },
      response: {},
      status: "completed",
    });
    expect(withoutJournal.getState().execution_journal).toHaveLength(1);
    expect(withoutJournal.getState().execution_journal[0]).toMatchObject({
      identity: "id:call-2",
      status: "completed",
      response_id: "",
    });
    expect(new Date(withoutJournal.getState().execution_journal[0].updated_at).toISOString()).toBe(
      withoutJournal.getState().execution_journal[0].updated_at,
    );
  });
});
