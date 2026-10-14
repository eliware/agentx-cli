import { expect, test } from "@jest/globals";
import { getWorkerStatus } from "../src/parallel-worker-status.mjs";

test("reports unknown workers", async () => {
  await expect(
    getWorkerStatus({ agent_ids: ["missing"] }, { workers: new Map() }),
  ).resolves.toMatchObject({ agents: [{ id: "missing", status: "unknown" }] });
});
