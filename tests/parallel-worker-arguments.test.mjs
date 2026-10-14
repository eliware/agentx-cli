import { expect, test } from "@jest/globals";
import { parseWorkerArguments } from "../src/parallel-worker-arguments.mjs";

test("parses worker arguments and defaults invalid input", () => {
  expect(parseWorkerArguments({ arguments: '{"task":"work"}' })).toEqual({ task: "work" });
  expect(parseWorkerArguments({ arguments: "invalid" })).toEqual({});
});
