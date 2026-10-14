import { expect, test } from "@jest/globals";
import { selectReadlineMenuChoice } from "../src/setup-readline-choice.mjs";

const entries = [
  { id: "model", label: "Model" },
  { id: "quit", label: "Quit" },
];

test.each([
  ["1", 0],
  ["quit", 1],
  ["Quit", 1],
])("selects a menu entry for input %s", async (answer, index) => {
  await expect(selectReadlineMenuChoice({ question: async () => answer }, entries)).resolves.toBe(
    entries[index],
  );
});

test("returns undefined for an unknown option", async () => {
  await expect(
    selectReadlineMenuChoice({ question: async () => "unknown" }, entries),
  ).resolves.toBeUndefined();
});
