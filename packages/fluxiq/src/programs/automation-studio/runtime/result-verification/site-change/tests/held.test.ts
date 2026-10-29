// A yes is not taken over a part the trial's change does not prove (t775,
// `../held.ts`), through the agreement that records it
// (`../../agreement/verification-agreement.ts`): the trial is judged against
// the site's state just before it and the change asked for (user, 2026-10-27).
import { describe, expect, it, vi } from "vitest";
import { automationStudioResultVerificationAgreement, automationStudioResultVerificationReaskContradicted } from "../../agreement/index.ts";
import { automationStudioResultVerificationFailsRun, type AutomationStudioResultVerification, type AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioResultVerdict } from "../../verdict/index.ts";
import { automationStudioResultSiteChangeHeld } from "../index.ts";
import { libraryHoldsChange, libraryHoldsSummary } from "./library-holds-fixture.ts";

const yes = (summary: AutomationStudioRunResultSummary): AutomationStudioResultVerification =>
  automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "yes", observed: "The holds list shows the new hold and the alert is set to email." }, basis: "model" });
const no = (summary: AutomationStudioRunResultSummary): AutomationStudioResultVerification =>
  automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "no", observed: "No hold on The Quiet Shore was placed.", changed: "Press Place hold." }, basis: "model" });
const twoYeses = (summary: AutomationStudioRunResultSummary) =>
  automationStudioResultVerificationAgreement({ first: yes(summary), second: yes(summary), confirmAnswer: true, summary });

describe("two yeses on a trial whose change proves an end state only as already_in_end_state", () => {
  it("are not taken: unsure, unconfirmed, the reason naming the part and its proof, and never a no Core made", () => {
    const summary = libraryHoldsSummary(libraryHoldsChange("already_in_end_state"));
    const agreed = twoYeses(summary);
    expect(agreed).toMatchObject({ verdict: "unsure", basis: "model_unconfirmed", code: "core.result.change_not_proven", verdicts: ["answers", "answers"], calls: 2 });
    expect(agreed.reason).toContain('part "p2" (already_in_end_state: the state it asks for already held before this trial began, and no step of this build was seen making that change)');
    expect(agreed.reason).not.toContain('part "p1"');
    expect(agreed.repair).toBeUndefined();
    expect(agreed.failure).toBeUndefined();
    expect(automationStudioResultVerificationFailsRun(agreed)).toBe(false);
    expect(agreed.answeredReading?.observed).toContain("alert is set to email");
  });

  it("are a yes where the same proof is carried: this build was seen making that change earlier", () => {
    const agreed = twoYeses(libraryHoldsSummary(libraryHoldsChange("carried")));
    expect(agreed).toMatchObject({ verdict: "answers", basis: "model", verdicts: ["answers", "answers"], calls: 2 });
  });

  it("are not taken where a change part shows no change, named; a place that went unread is left to the judge", () => {
    const base = libraryHoldsChange("carried");
    const proofs = (proof: "no_change" | "unproven") => ({ ...base, proofs: [{ ...base.proofs[0]!, proof }, base.proofs[1]!] });
    expect(twoYeses(libraryHoldsSummary(proofs("no_change"))).reason).toContain('part "p1" (no_change: it asks for a change, and every place that change shows read the same before and after this trial)');
    // Unproven says nothing failed: Core read nothing there, and the judge decides from the run and its end view.
    expect(twoYeses(libraryHoldsSummary(proofs("unproven")))).toMatchObject({ verdict: "answers" });
  });

  it("are not taken where a part is contradicted: the trial undid what it asks for", () => {
    const base = libraryHoldsChange("carried");
    const summary = libraryHoldsSummary({ ...base, proofs: [{ ...base.proofs[0]!, proof: "contradicted" }, base.proofs[1]!] });
    const agreed = twoYeses(summary);
    expect(agreed).toMatchObject({ verdict: "unsure", basis: "model_unconfirmed", code: "core.result.change_not_proven" });
    expect(agreed.reason).toContain(`part "p1" (contradicted: it asks to add, and a place this part's change shows went back to how it was before this trial, so the trial undid what it asks for)`);
    expect(automationStudioResultVerificationFailsRun(agreed)).toBe(false);
  });

  it("leaves a no, an unsure and a summary with no siteChange exactly as they were", () => {
    const summary = libraryHoldsSummary(libraryHoldsChange("already_in_end_state"));
    const double = automationStudioResultVerificationAgreement({ first: no(summary), second: no(summary), confirmAnswer: true });
    expect(double).toMatchObject({ verdict: "does_not_answer", verdicts: ["does_not_answer", "does_not_answer"] });
    const { siteChange: _dropped, ...plain } = summary;
    expect(twoYeses(plain)).toMatchObject({ verdict: "answers", calls: 2 });
    const unsure = { ...yes(summary), verdict: "unsure" as const };
    expect(automationStudioResultSiteChangeHeld(unsure, summary)).toBe(unsure);
  });

  it("holds a yes a contradicted re-ask brings back too", async () => {
    const summary = libraryHoldsSummary(libraryHoldsChange("already_in_end_state"));
    const doubt = automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "unknown", observed: "Cannot tell." }, basis: "model" });
    const settled = { ...twoYeses(summary), verdict: "unsure" as const, basis: "model_unconfirmed" as const, contradictedUnsure: { call: 2 as const, record: "Core's record." }, verdicts: ["answers" as const, "unsure" as const] };
    const ask = vi.fn(async () => yes(summary));
    const outcome = await automationStudioResultVerificationReaskContradicted({ first: yes(summary), second: doubt, confirmAnswer: true, summary, settled, ask });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ verdict: "unsure", code: "core.result.change_not_proven" });
  });
});
