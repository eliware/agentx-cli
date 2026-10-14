import { expect, test } from "@jest/globals";
import "../../test-fixtures/agent-turn/response-service-suite.mjs";
import "../../test-fixtures/agent-turn/response-service-stream-events-suite.mjs";
import "../../test-fixtures/agent-turn/response-service-stream-text-suite.mjs";

test("the matching implementation exports its public function", async () => {
  const source = await import("../../src/agent-turn/response-service.mjs");
  expect(Object.keys(source).length).toBeGreaterThan(0);
});
