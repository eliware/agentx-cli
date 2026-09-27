import { describe, expect, jest, test } from "@jest/globals";
import { createAgentProcessLifecycle } from "../../src/agent/process-lifecycle.mjs";

function createLifecycle() {
  const order = [];
  let registration;
  const signalRegistration = { removeHandlers: jest.fn() };
  const lifecycle = createAgentProcessLifecycle({
    logger: "test-logger",
    registerLogHandlers: jest.fn((options) => order.push(["logs", options])),
    registerSignalHandlers: jest.fn((options) => {
      order.push(["signals", options]);
      registration = options;
      return signalRegistration;
    }),
    terminateActiveWorkers: jest.fn(async () => order.push(["workers"])),
  });
  return { lifecycle, order, signalRegistration, getShutdownHook: () => registration.shutdownHook };
}

describe("agent process lifecycle", () => {
  test("registers process handlers and closes client before terminating workers", async () => {
    const { lifecycle, order, signalRegistration, getShutdownHook } = createLifecycle();
    const close = jest.fn(async () => order.push(["client"]));
    lifecycle.setActiveClient({ responses: { close } });
    expect(lifecycle.signalRegistration).toBe(signalRegistration);
    expect(order[0]).toEqual(["logs", { log: "test-logger" }]);
    expect(order[1][0]).toBe("signals");
    await getShutdownHook()();
    expect(order.slice(2)).toEqual([["client"], ["workers"]]);
    expect(close).toHaveBeenCalledTimes(1);
  });

  test("still terminates workers if the client is already closed", async () => {
    const { lifecycle, order, getShutdownHook } = createLifecycle();
    lifecycle.setActiveClient({ responses: { close: async () => { throw new Error("closed"); } } });
    await expect(getShutdownHook()()).resolves.toBeUndefined();
    expect(order.at(-1)).toEqual(["workers"]);
  });

  test("tolerates absent client response transport and supports clearing the active client", async () => {
    const { lifecycle, order, getShutdownHook } = createLifecycle();
    lifecycle.setActiveClient({});
    lifecycle.clearActiveClient();
    await getShutdownHook()();
    expect(order.at(-1)).toEqual(["workers"]);
  });
});
