import { describe, expect, test } from "@jest/globals";
import { createDebugEventHandler } from "../../src/agent-turn/response-debug-events.mjs";

describe("response debug events", () => {
  test("logs raw payloads and falls back to normalized events", () => {
    const writes = [];
    const handler = createDebugEventHandler({ write: (value) => writes.push(value) });
    handler({ type: "response.completed" }, { raw: "raw event" });
    handler({ type: "response.created" });
    expect(writes).toEqual([
      '[openai:event] {"raw":"raw event"}\n',
      '[openai:event] {"type":"response.created"}\n',
    ]);
  });
});
