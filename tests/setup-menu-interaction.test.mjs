import { describe, expect, test } from "@jest/globals";
import { selectReadlineMenuChoice } from "../src/setup-menu-interaction.mjs";

describe("setup readline menu interaction", () => {
  const entries = [
    { id: "model", label: "Model" },
    { id: "quit", label: "Quit" },
  ];

  test("matches numeric, identifier, and label input", async () => {
    await expect(selectReadlineMenuChoice({ question: async () => "1" }, entries)).resolves.toBe(
      entries[0],
    );
    await expect(selectReadlineMenuChoice({ question: async () => "quit" }, entries)).resolves.toBe(
      entries[1],
    );
    await expect(selectReadlineMenuChoice({ question: async () => "Quit" }, entries)).resolves.toBe(
      entries[1],
    );
  });

  test("returns undefined for an unknown option", async () => {
    await expect(
      selectReadlineMenuChoice({ question: async () => "unknown" }, entries),
    ).resolves.toBeUndefined();
  });
});
