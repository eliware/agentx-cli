import { expect, test } from "@jest/globals";
import { selectImageInspectionParent } from "../src/image-inspection-parent.mjs";

test("selects the nearest available response parent", () => {
  expect(
    selectImageInspectionParent({
      previousResponseId: "request-parent",
      callerResponse: { previous_response_id: "caller-parent" },
      responseId: "fallback",
    }),
  ).toBe("request-parent");
  expect(
    selectImageInspectionParent({
      callerResponse: { previous_response_id: "caller-parent" },
      responseId: "fallback",
    }),
  ).toBe("caller-parent");
  expect(selectImageInspectionParent({ responseId: "fallback" })).toBe("fallback");
  expect(selectImageInspectionParent({})).toBeUndefined();
});
