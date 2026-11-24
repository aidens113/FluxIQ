import { expect, it } from "vitest";
import { automationStudioRunDatasetCapturedFields } from "../captured-fields.ts";

it("reads a stored captured field list, and knows none for a batch written before migration 0041 (t998)", () => {
  expect(automationStudioRunDatasetCapturedFields('["id","title","tag"]')).toEqual(["id", "title", "tag"]);
  expect(automationStudioRunDatasetCapturedFields("[]")).toEqual([]);
  expect(automationStudioRunDatasetCapturedFields(null)).toBeUndefined();
  expect(automationStudioRunDatasetCapturedFields(undefined)).toBeUndefined();
});

it("fails closed on a stored value that is not a list of ids, never reading corruption as unknown", () => {
  for (const corrupt of ["", "not json"]) expect(() => automationStudioRunDatasetCapturedFields(corrupt)).toThrow(SyntaxError);
  for (const corrupt of ["{}", '["id", 3]', "null"]) expect(() => automationStudioRunDatasetCapturedFields(corrupt)).toThrow("Invalid run dataset batch captured fields.");
});
