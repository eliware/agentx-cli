import { expect, test } from "@jest/globals";
import { parseWorkerArguments, parseWorkerIds } from "../src/parallel-worker-arguments.mjs";

test("parses worker arguments and defaults invalid input", () => {
  expect(parseWorkerArguments({ arguments: '{"task":"work"}' })).toEqual({ task: "work" });
  expect(parseWorkerArguments({ arguments: "invalid" })).toEqual({});
});

test("filters worker identifiers and limits the request", () => {
  expect(
    parseWorkerIds({ agent_ids: [" one ", "", null, ...Array(11).fill("more")] }),
  ).toHaveLength(10);
  expect(parseWorkerIds({})).toEqual([]);
});
