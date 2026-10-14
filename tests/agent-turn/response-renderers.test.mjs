import { expect, jest, test } from "@jest/globals";
import { createResponseRenderers } from "../../src/agent-turn/response-renderers.mjs";

test("creates the focused response renderers with shared output context", () => {
  const statusController = { pause: jest.fn() };
  const markOutput = jest.fn();
  const renderers = createResponseRenderers({ statusController, markOutput });
  expect(renderers.text).toEqual(
    expect.objectContaining({
      writeTextDelta: expect.any(Function),
      flushTextDelta: expect.any(Function),
    }),
  );
  expect(renderers.reasoning).toEqual(
    expect.objectContaining({ writeDelta: expect.any(Function), finish: expect.any(Function) }),
  );
  expect(renderers.webSearch).toEqual(
    expect.objectContaining({ start: expect.any(Function), searching: expect.any(Function) }),
  );
  expect(renderers.mcp).toEqual(
    expect.objectContaining({ handleEvent: expect.any(Function), addCall: expect.any(Function) }),
  );
  expect(renderers.tool).toEqual(
    expect.objectContaining({ writeDelta: expect.any(Function), finishItem: expect.any(Function) }),
  );
});
