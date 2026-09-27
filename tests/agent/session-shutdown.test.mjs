import { describe, expect, jest, test } from "@jest/globals";
import { shutdownAgentSession } from "../../src/agent/session-shutdown.mjs";

describe("session shutdown", () => {
  test("closes resources and restores process-level state in order", async () => {
    const order = [];
    const readline = { close: () => order.push("readline") };
    const client = { responses: { close: async () => order.push("client") } };
    const signalRegistration = { removeHandlers: () => order.push("signals") };
    await shutdownAgentSession({
      readline,
      client,
      signalRegistration,
      deps: {
        clearActiveClient: () => order.push("active-client"),
        terminateWorkers: async () => order.push("workers"),
        restoreTerminalOutput: () => order.push("terminal"),
      },
    });
    expect(order).toEqual([
      "readline",
      "client",
      "active-client",
      "workers",
      "signals",
      "terminal",
    ]);
  });

  test("continues cleanup if client close rejects and tolerates absent optional resources", async () => {
    const terminateWorkers = jest.fn(async () => {});
    const restoreTerminalOutput = jest.fn();
    await expect(
      shutdownAgentSession({
        readline: null,
        client: {
          responses: {
            close: async () => {
              throw new Error("already closed");
            },
          },
        },
        signalRegistration: {},
        deps: {
          clearActiveClient: jest.fn(),
          terminateWorkers,
          restoreTerminalOutput,
        },
      }),
    ).resolves.toBeUndefined();
    expect(terminateWorkers).toHaveBeenCalledTimes(1);
    expect(restoreTerminalOutput).toHaveBeenCalledTimes(1);
  });
});
