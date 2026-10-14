import { describe, expect, jest, test } from "@jest/globals";
import { askToRunSetup } from "../src/agent-entrypoint-prompt.mjs";

describe("entrypoint setup prompt", () => {
  test("asks the setup question and closes readline", async () => {
    const readline = { question: jest.fn(async () => "y"), close: jest.fn() };
    const createInterface = jest.fn(() => readline);
    await expect(askToRunSetup({ input: "in", output: "out", createInterface })).resolves.toBe("y");
    expect(createInterface).toHaveBeenCalledWith({ input: "in", output: "out" });
    expect(readline.question).toHaveBeenCalledWith(
      "AgentX is not configured. Run agentx-setup now? [Y/n] ",
    );
    expect(readline.close).toHaveBeenCalled();
  });
});
