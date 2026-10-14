import { expect, test } from "@jest/globals";
import { createResponseAnsiParser } from "../../src/agent-turn/response-ansi-parser.mjs";

test("buffers split CSI escapes until a complete sequence arrives", () => {
  const parser = createResponseAnsiParser();
  expect(parser.parse("before \u001b[")).toBe("before ");
  expect(parser.parse("31mred")).toBe("\u001b[31mred");
  expect(parser.flush()).toBe("");
});

test("flushes incomplete and non-CSI fragments safely", () => {
  const parser = createResponseAnsiParser();
  expect(parser.parse("x\u001b")).toBe("x");
  expect(parser.flush()).toBe("\u001b");
  expect(parser.parse("y\u001bZ")).toBe("y\u001bZ");
  expect(parser.parse("text\u001b[31")).toBe("text");
  expect(parser.flush()).toBe("\u001b[31");
  expect(parser.flush()).toBe("");
});

test("keeps an incomplete CSI fragment when the sequence starts a delta", () => {
  const parser = createResponseAnsiParser();
  expect(parser.parse("\u001b[32")).toBe("");
  expect(parser.flush()).toBe("\u001b[32");
});
