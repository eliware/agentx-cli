import { expect, test } from "@jest/globals";
import {
  normalizeSpawnWorkerArguments,
  parseWorkerArguments,
  parseWorkerIds,
} from "../src/parallel-worker-arguments.mjs";

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

test("validates spawn task text and normalizes permissions", () => {
  expect(normalizeSpawnWorkerArguments({ task: "  work  ", permissions: "read" })).toEqual({
    task: "work",
    permissions: "read",
  });
  expect(normalizeSpawnWorkerArguments({ task: "work", permissions: "admin" })).toEqual({
    task: "work",
    permissions: "execute",
  });
  expect(normalizeSpawnWorkerArguments({ task: "  " })).toEqual({
    error: "task must be a non-empty string",
  });
});
