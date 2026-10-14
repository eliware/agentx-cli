import { expect, test } from "@jest/globals";
import { acceptsSetupAnswer, isSetupEligible } from "../src/agent-entrypoint-setup-policy.mjs";

test("allows setup only for eligible interactive states", () => {
  const keyPresent = () => true;
  expect(
    isSetupEligible({ isTest: false, isTty: true, configured: false, hasApiKey: keyPresent }),
  ).toBe(true);
  expect(
    isSetupEligible({ isTest: true, isTty: true, configured: false, hasApiKey: keyPresent }),
  ).toBe(false);
  expect(
    isSetupEligible({ isTest: false, isTty: false, configured: false, hasApiKey: keyPresent }),
  ).toBe(false);
  expect(
    isSetupEligible({ isTest: false, isTty: true, configured: true, hasApiKey: keyPresent }),
  ).toBe(false);
});

test("accepts empty, yes, and y answers after trim and case folding", () => {
  expect(acceptsSetupAnswer("")).toBe(true);
  expect(acceptsSetupAnswer(" Y ")).toBe(true);
  expect(acceptsSetupAnswer("Yes")).toBe(true);
  expect(acceptsSetupAnswer("no")).toBe(false);
});
