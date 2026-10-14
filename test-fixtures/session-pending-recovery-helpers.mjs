import { jest } from "@jest/globals";

export const baseState = () => ({
  response_id: "response-pending",
  usage: { inputTokens: 3 },
  last_user_message: "question",
  last_assistant_message: "partial",
  pending_tool_calls: [{ id: "call-1" }],
  pending_transaction: null,
  pending_retry_request: { request: true },
  failed_response: false,
  history: [],
});

export function harness(choice, initialState = baseState()) {
  let state = initialState;
  const deps = {
    promptResumeMenu: jest.fn(async () => choice),
    createUsageTotals: jest.fn(() => ({ turns: 0 })),
    saveState: jest.fn(async () => {}),
    persistCheckpoint: jest.fn(async () => {}),
    writeSystem: jest.fn(),
    resetState: jest.fn((usage) => {
      state = { ...baseState(), usage, pending_tool_calls: [], pending_transaction: null };
    }),
    clearSession: jest.fn(async () => {}),
    createRunner: jest.fn(() => "runner"),
    extractAssistantText: jest.fn((response) => response?.output_text || ""),
  };
  return {
    deps,
    getState: () => state,
    setState: (next) => {
      state = next;
    },
  };
}
