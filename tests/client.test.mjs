import { describe, expect, jest, test } from "@jest/globals";

const defaultClient = { responses: { on: jest.fn() } };
const defaultClientFactory = jest.fn(() => defaultClient);
jest.unstable_mockModule("@eliware/openai", () => ({ createOpenAI: defaultClientFactory }));
const { bindAgentDebugListeners, createAgentClient, resolveAgentApiKey } =
  await import("../src/agent/client.mjs");

function createFakeClient() {
  const listeners = new Map();
  return {
    listeners,
    responses: {
      on: jest.fn((event, callback) => listeners.set(event, callback)),
    },
  };
}

describe("AgentX OpenAI client boundary", () => {
  test("resolves the configured API key with lowercase precedence", () => {
    expect(resolveAgentApiKey({ agentx_api_key: " lower ", AGENTX_API_KEY: "upper" })).toBe(
      "lower",
    );
    expect(resolveAgentApiKey({ AGENTX_API_KEY: " upper " })).toBe("upper");
    expect(() => resolveAgentApiKey({})).toThrow(
      "Set agentx_api_key or AGENTX_API_KEY in your shell environment.",
    );
  });

  test("resolves API keys from process.env by default", () => {
    const lower = process.env.agentx_api_key;
    const upper = process.env.AGENTX_API_KEY;
    try {
      delete process.env.agentx_api_key;
      process.env.AGENTX_API_KEY = "process-key";
      expect(resolveAgentApiKey()).toBe("process-key");
    } finally {
      if (lower === undefined) delete process.env.agentx_api_key;
      else process.env.agentx_api_key = lower;
      if (upper === undefined) delete process.env.AGENTX_API_KEY;
      else process.env.AGENTX_API_KEY = upper;
    }
  });

  test("creates the configured SDK client and always handles transport errors", () => {
    const client = createFakeClient();
    const clientFactory = jest.fn(() => client);
    const stderr = { write: jest.fn() };
    let debug = false;
    expect(
      createAgentClient({
        apiKey: "test-key",
        isDebugEnabled: () => debug,
        clientFactory,
        stderr,
      }),
    ).toBe(client);
    expect(clientFactory).toHaveBeenCalledWith({ apiKey: "test-key", transport: "websocket" });
    expect(client.listeners.has("error")).toBe(true);
    client.listeners.get("error")({ message: "quiet" });
    expect(stderr.write).not.toHaveBeenCalled();
    debug = true;
    client.listeners.get("error")({ message: "diagnostic" });
    client.listeners.get("error")(null);
    expect(stderr.write.mock.calls.join("")).toContain('[openai:error] {"message":"diagnostic"}');
    expect(stderr.write.mock.calls.join("")).toContain("[openai:error] {}\n");
  });

  test("binds transport diagnostics when debug is enabled at client creation", () => {
    const client = createFakeClient();
    const stderr = { write: jest.fn() };
    createAgentClient({
      apiKey: "key",
      isDebugEnabled: () => true,
      clientFactory: () => client,
      stderr,
    });
    for (const event of ["connecting", "open", "reconnecting", "reconnected", "close"])
      client.listeners.get(event)({ state: event });
    expect(stderr.write).toHaveBeenCalledTimes(5);
    expect(stderr.write.mock.calls.join("")).toContain(
      '[openai:reconnected] {"state":"reconnected"}',
    );
  });

  test("does not require optional Responses event support", () => {
    const client = { responses: {} };
    expect(createAgentClient({ clientFactory: () => client })).toBe(client);
    expect(bindAgentDebugListeners(client)).toBe(false);
    expect(bindAgentDebugListeners(null)).toBe(false);
    const eventClient = createFakeClient();
    expect(createAgentClient({ clientFactory: () => eventClient })).toBe(eventClient);
    eventClient.listeners.get("error")({ message: "not-debugging" });
  });

  test("uses the official SDK factory when no factory options are supplied", () => {
    expect(createAgentClient()).toBe(defaultClient);
    expect(defaultClientFactory).toHaveBeenCalledWith({
      apiKey: undefined,
      transport: "websocket",
    });
  });

  test("binds debug listeners directly when the transport supports events", () => {
    const client = createFakeClient();
    const stderr = { write: jest.fn() };
    expect(bindAgentDebugListeners(client, stderr)).toBe(true);
    client.listeners.get("open")();
    expect(stderr.write).toHaveBeenCalledWith("[openai:open] {}\n");
  });
});
