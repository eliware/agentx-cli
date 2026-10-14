import { expect, jest, test } from "@jest/globals";
import { withSetupReadline } from "../src/setup-readline-lifecycle.mjs";

test("closes the setup Readline after the workflow succeeds", async () => {
  const readline = { close: jest.fn() };
  await expect(
    withSetupReadline(
      {},
      async (active) => active,
      () => readline,
    ),
  ).resolves.toBe(readline);
  expect(readline.close).toHaveBeenCalledTimes(1);
});

test("closes the setup Readline after the workflow fails", async () => {
  const readline = { close: jest.fn() };
  const error = new Error("setup failed");
  await expect(
    withSetupReadline(
      {},
      () => Promise.reject(error),
      () => readline,
    ),
  ).rejects.toBe(error);
  expect(readline.close).toHaveBeenCalledTimes(1);
});
