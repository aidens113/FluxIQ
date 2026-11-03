import { expect, it } from "vitest";
import { automationStudioProjectDecisionLogEntry } from "../index.ts";

const parse = automationStudioProjectDecisionLogEntry.parse;

it("parses a decision with its reason", () => {
  const entry = { kind: "dispatch", reason: "Both parts are independent.", briefIds: ["b1", "b2"], planDigest: "d".repeat(64) };
  expect(parse(entry)).toEqual({ status: "valid", value: entry });
});

it.each([
  [{ kind: "guess", reason: "x", briefIds: [] }, "project.invalid_choice"],
  [{ kind: "triage", reason: " ", briefIds: [] }, "project.invalid_text"],
  [{ kind: "triage", reason: "x", briefIds: ["b1", "b1"] }, "project.duplicate"],
  [{ kind: "triage", reason: "x" }, "project.missing_field"]
])("refuses a malformed decision", (value, code) => {
  expect(parse(value)).toMatchObject({ status: "invalid", code });
});
