import { describe, expect, test } from "@jest/globals";
import {
  decideRecoveryMenuChoice,
  decideRequestFailure,
  isWebsocketRecoveryError,
} from "../../src/agent/request-recovery.mjs";

describe("request recovery decisions", () => {
  test("recognizes WebSocket failures from codes, messages, and causes", () => {
    expect(isWebsocketRecoveryError({ code: "websocket_connection_limit_reached" })).toBe(true);
    expect(isWebsocketRecoveryError(new Error("websocket_connection_limit_reached"))).toBe(true);
    expect(
      isWebsocketRecoveryError({ cause: new Error("cannot send on a closed WebSocket") }),
    ).toBe(true);
    expect(isWebsocketRecoveryError(new Error("unrelated request failure"))).toBe(false);
  });

  test("selects bounded reconnect, missing-parent new-chain, one-shot, and menu actions", () => {
    const expired = new Error("cannot send on a closed WebSocket");
    expired.code = "websocket_closed";
    expect(
      decideRequestFailure(expired, { websocketRetryAvailable: true, recoveryAttempts: 0 }),
    ).toEqual({ action: "reconnect", recoveryAttempts: 0 });
    expect(decideRequestFailure(expired, { oneShot: true, recoveryAttempts: 0 })).toEqual({
      action: "fail",
      recoveryAttempts: 1,
    });
    expect(decideRequestFailure(expired, { recoveryAttempts: 0 })).toEqual({
      action: "prompt",
      recoveryAttempts: 1,
    });

    const missingParent = Object.assign(new Error("not found"), {
      code: "previous_response_not_found",
    });
    expect(decideRequestFailure(missingParent, { previousResponseId: "old-response" })).toEqual({
      action: "new-chain",
      recoveryAttempts: 1,
    });
    expect(decideRequestFailure(missingParent, { oneShot: true })).toEqual({
      action: "retry-pending",
      recoveryAttempts: 1,
    });
    expect(decideRequestFailure(new Error("failed"), { oneShot: true })).toEqual({
      action: "retry-pending",
      recoveryAttempts: 1,
    });
    expect(
      decideRequestFailure(new Error("failed"), { oneShot: true, recoveryAttempts: 1 }),
    ).toEqual({
      action: "fail",
      recoveryAttempts: 1,
    });
    expect(decideRequestFailure(new Error("failed"))).toEqual({
      action: "prompt",
      recoveryAttempts: 0,
    });
  });

  test("maps recovery menu choices and enforces the new-chain bound", () => {
    expect(decideRecoveryMenuChoice("cancel")).toEqual({ action: "dismiss", recoveryAttempts: 0 });
    expect(decideRecoveryMenuChoice("retry", 0)).toEqual({ action: "retry", recoveryAttempts: 1 });
    expect(decideRecoveryMenuChoice("debug-retry", 1)).toEqual({
      action: "debug-retry",
      recoveryAttempts: 2,
    });
    expect(decideRecoveryMenuChoice("new-chain", 1)).toEqual({
      action: "new-chain",
      recoveryAttempts: 2,
    });
    expect(decideRecoveryMenuChoice("new-chain", 2)).toEqual({
      action: "dismiss",
      recoveryAttempts: 2,
    });
    expect(decideRecoveryMenuChoice("rollback", 2)).toEqual({
      action: "rollback",
      recoveryAttempts: 2,
    });
    expect(decideRecoveryMenuChoice("clear", 2)).toEqual({
      action: "clear",
      recoveryAttempts: 2,
    });
    expect(decideRecoveryMenuChoice("cancel", 2)).toEqual({
      action: "dismiss",
      recoveryAttempts: 2,
    });
  });
});
