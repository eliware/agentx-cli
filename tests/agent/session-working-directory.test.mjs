import { describe, expect, test } from "@jest/globals";
import { createSessionWorkingDirectory } from "../../src/agent/session-working-directory.mjs";

describe("session working directory", () => {
  test("returns the initial directory and tracks updates", () => {
    const directory = createSessionWorkingDirectory("C:/work");
    expect(directory.get()).toBe("C:/work");
    directory.set("C:/next");
    expect(directory.get()).toBe("C:/next");
  });
});
