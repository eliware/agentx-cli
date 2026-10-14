import { expect, test } from "@jest/globals";
import { cloneJsonValue } from "../src/json-value-clone.mjs";

test("clones JSON values without retaining object references", () => {
  const value = { nested: [{ answer: 42 }] };
  const clone = cloneJsonValue(value);
  expect(clone).toEqual(value);
  expect(clone).not.toBe(value);
  expect(clone.nested).not.toBe(value.nested);
});

test("returns null when a value cannot be cloned as JSON", () => {
  const circular = {};
  circular.self = circular;
  expect(cloneJsonValue(circular)).toBeNull();
  expect(cloneJsonValue(undefined)).toBeNull();
});
