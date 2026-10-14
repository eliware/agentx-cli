import { describe, expect, test, jest } from "@jest/globals";
import { isWebsocketRetryAvailable } from "../../src/agent/session-websocket-recovery.mjs";

describe("session WebSocket recovery", () => {
  test("sets the first retry time and checks retry availability", async () => {
    const wait = jest.fn().mockResolvedValue(true);
    const state = { websocketRecoveryAttempts: 2 };
    const available = await isWebsocketRetryAvailable(new Error("closed"), state, () => 42, {
      isWebsocketRecoveryError: () => true,
      waitForWebsocketRetry: wait,
    });
    expect(available).toBe(true);
    expect(state.websocketRecoveryStartedAt).toBe(42);
    expect(wait).toHaveBeenCalledWith(42, 2);
  });

  test("skips retry timing for other failures", async () => {
    const wait = jest.fn();
    await expect(
      isWebsocketRetryAvailable(new Error("other"), {}, Date.now, {
        isWebsocketRecoveryError: () => false,
        waitForWebsocketRetry: wait,
      }),
    ).resolves.toBe(false);
    expect(wait).not.toHaveBeenCalled();
  });
});
