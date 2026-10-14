import { expect, test } from "@jest/globals";
import { recordsIn } from "../src/worker-record-index.mjs";

test("returns no records for a missing worker directory", async () => {
  await expect(
    recordsIn("missing", async () => {
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    }),
  ).resolves.toEqual([]);
});
