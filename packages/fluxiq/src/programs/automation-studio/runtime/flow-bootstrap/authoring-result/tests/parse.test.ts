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

// t340: a draft may say why it stayed a draft; a candidate's proposal must name the trial behind it.
import { parseAutomationStudioCandidateProposalResult as proposal } from "../parse.ts";
it("carries a draft's trial block and refuses a malformed one", () => {
  const trial = { verdict: "yes", runId: "trial.1", codes: ["FLOW_BOOTSTRAP_STALE"] };
  const result = parse({ candidate: { ...candidate(), trial } }, subject);
  expect(result?.trial).toEqual(trial); expect(Object.isFrozen(result?.trial)).toBe(true);
  expect(parse({ candidate: { ...candidate(), trial: { verdict: "not_tested", codes: [] } } }, subject)?.trial).toEqual({ verdict: "not_tested", codes: [] });
  for (const bad of [{ verdict: "passed", codes: [] }, { verdict: "no" }, { verdict: "no", codes: [""] }, { verdict: "no", codes: [], promotionAllowed: true }]) expect(parse({ candidate: { ...candidate(), trial: bad } }, subject)).toBeNull();
  expect(parse({ candidate: { ...candidate(), promotionAllowed: true, trial } }, subject)).toBeNull();
});
const adaptation = () => ({ status: "proposed", projectId: "project", flowId: "flow", adaptationId: "adaptation.bootstrap.1", riskLevel: "low", sourceInstructionIds: ["instruction"], baseDependencyDigest: "base", baseSettingsRevision: 0,
  accounting: { requestId: "request", estimatedInputTokens: 10 }, candidate: { candidateId: "candidate", revision: 2, digest: "a".repeat(64), trial: { runId: "trial.1", verdict: "yes", calls: 2 } } });
it("parses a candidate's proposal with the trial that made it", () => {
  expect(proposal({ adaptation: adaptation() }, subject)).toEqual({ status: "proposed", projectId: "project", flowId: "flow", adaptationId: "adaptation.bootstrap.1", awaitingPermission: false, candidate: { candidateId: "candidate", revision: 2, digest: "a".repeat(64), trial: { runId: "trial.1", verdict: "yes", calls: 2 } } });
  expect(proposal({ adaptation: { ...adaptation(), permissionRequest: { missing: ["move_money"] } } }, subject)?.awaitingPermission).toBe(true);
});
it.each([
  ["a proposal without the candidate block", () => { const { candidate: _dropped, ...legacy } = adaptation(); return legacy; }],
  ["a trial that was not a yes", () => ({ ...adaptation(), candidate: { ...adaptation().candidate, trial: { runId: "trial.1", verdict: "unsure", calls: 2 } } })],
  ["a yes no second call confirmed", () => ({ ...adaptation(), candidate: { ...adaptation().candidate, trial: { runId: "trial.1", verdict: "yes", calls: 1 } } })],
  ["a trial with no run", () => ({ ...adaptation(), candidate: { ...adaptation().candidate, trial: { verdict: "yes", calls: 2 } } })],
  ["another Flow's proposal", () => ({ ...adaptation(), flowId: "foreign" })],
  ["a draft status", () => ({ ...adaptation(), status: "draft" })],
  ["an unknown field", () => ({ ...adaptation(), promotionAllowed: true })]
])("refuses %s", (_name, make) => {
  expect(proposal({ adaptation: make() }, subject)).toBeNull();
});
it("the draft parser never reads a proposal, nor the proposal parser a draft", () => {
  expect(parse({ adaptation: adaptation() }, subject)).toBeNull();
  expect(proposal({ candidate: candidate() }, subject)).toBeNull();
});
