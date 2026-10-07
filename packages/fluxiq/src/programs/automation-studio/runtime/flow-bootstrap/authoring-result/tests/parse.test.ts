import { expect, it } from "vitest";
import { parseAutomationStudioCandidateAuthoringResult as parse } from "../parse.ts";
const candidate = () => ({ status: "draft", projectId: "project", flowId: "flow", candidateId: "candidate", revision: 1, digest: "a".repeat(64), sourceInstructionIds: ["instruction"], baseDependencyDigest: "base", baseSettingsRevision: 0, verification: "not_performed", promotionAllowed: false, accounting: { requestId: "request", estimatedInputTokens: 10, estimatedCostUsd: 0.001 } });
const subject = { projectId: "project", flowId: "flow" };
it("copies and freezes a valid draft while retaining original references and accounting", () => {
  const input = candidate(), result = parse({ candidate: input }, subject);
  expect(result).toMatchObject({ candidateId: "candidate", verification: "not_performed", promotionAllowed: false, sourceInstructionIds: ["instruction"], accounting: { estimatedCostUsd: 0.001 } });
  input.sourceInstructionIds[0] = "changed";
  expect(result?.sourceInstructionIds).toEqual(["instruction"]);
  expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result?.accounting)).toBe(true);
});
it.each([{ projectId: "foreign" }, { flowId: "foreign" }, { candidateId: "borrowed" }, { revision: 2 }, { digest: "b".repeat(64) }])("refuses mismatched expected binding %j", (changed) => {
  expect(parse({ candidate: candidate() }, { ...subject, candidateId: "candidate", revision: 1, digest: "a".repeat(64), ...changed })).toBeNull();
});
it.each([{ status: "proposed" }, { verification: "passed" }, { promotionAllowed: true }, { revision: 0 }, { digest: "sha256:" + "a".repeat(64) }, { adaptationId: "adaptation" }, { accounting: { requestId: "request", estimatedInputTokens: -1 } }])("refuses malformed or authority-shaped draft %j", (changed) => {
  expect(parse({ candidate: { ...candidate(), ...changed } }, subject)).toBeNull();
});
it("refuses a legacy or ambiguous envelope", () => {
  expect(parse({ adaptation: { status: "proposed" } }, subject)).toBeNull();
  expect(parse({ candidate: candidate(), adaptation: {} }, subject)).toBeNull();
});
it("refuses getters and symbols without invoking them", () => {
  let read = false;
  expect(parse({ get candidate() { read = true; return candidate(); } }, subject)).toBeNull();
  expect(read).toBe(false);
  expect(parse({ candidate: { ...candidate(), [Symbol("authority")]: true } }, subject)).toBeNull();
});
