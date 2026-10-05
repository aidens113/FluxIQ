import { describe, expect, it } from "vitest";
import { ACTIVITY_RESULT_CHECK_LABELS, activityActionOf } from "../../../../../ui/index.ts";
import { automationStudioResultCheckActivity } from "../check-activity.ts";
import type { AutomationStudioResultVerificationOutcome, AutomationStudioRunResultSummary } from "../contracts.ts";
import { automationStudioResultVerificationAgreement } from "../agreement.ts";
import { automationStudioResultVerdict } from "../verdict.ts";
import { runWithAutomationStudioActivity } from "../../activity/index.ts";

const summary: AutomationStudioRunResultSummary = {
  schemaVersion: "automation-studio.run-result-summary.v1",
  totalRecordCount: 3,
  totalRefusedCount: 0,
  totalRowsMissingRequired: 0,
  recordSetCount: 1,
  recordSets: [],
  flowShape: [{ nodeId: "n1", definitionId: "navigate" }],
  withheld: false
};

const performed = (verification: ReturnType<typeof automationStudioResultVerdict>): AutomationStudioResultVerificationOutcome => ({ ...verification, performed: true });

describe("automationStudioResultCheckActivity", () => {
  it("says a result that answers as a pass, in Core's sentence", () => {
    const words = automationStudioResultCheckActivity(performed(automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "yes" }, basis: "model" })));
    expect(words).toEqual({ label: "The result answers the request", status: "succeeded", text: "3 rows came back. The result was judged to answer the request." });
  });

  it("says a refuted result as a failure with what the check found and advised", () => {
    const refuted = automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "no", observed: "Only three listings were saved", changed: "Read every page of results" }, basis: "model" });
    const words = automationStudioResultCheckActivity(performed(automationStudioResultVerificationAgreement({ first: refuted, second: refuted })));
    expect(words.label).toBe("The result doesn't answer the request");
    expect(words.status).toBe("failed");
    expect(words.text).toContain("judged not to answer the request");
    expect(words.text).toContain("What it found: Only three listings were saved");
    // The advice is for the repair, not the person (t194-w81, U6).
    expect(words.text).not.toContain("Read every page of results");
    expect(words.text).not.toContain("What to change");
    expect(words.text).not.toMatch(/core\.result\./u);
  });

  it("says an unconfirmed result is not a pass, and a skipped check plainly", () => {
    const no = automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "no" }, basis: "model" });
    const yes = automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "yes" }, basis: "model" });
    const unconfirmed = automationStudioResultCheckActivity(performed(automationStudioResultVerificationAgreement({ first: no, second: yes })));
    expect(unconfirmed).toMatchObject({ label: "Couldn't confirm the result answers the request", status: "failed" });
    const skipped = automationStudioResultCheckActivity({ schemaVersion: "automation-studio.result-verification.v1", performed: false, code: "core.result.no_model_available", reason: "No model was available to judge this run's result." });
    expect(skipped).toEqual({ label: "The result couldn't be checked", status: "failed", text: "No model was available to judge this run's result." });
  });

  // t174-w85 D1 (run-murwd8le-79e735a8, 00019): the judges disagreed, so the result was
  // unverified, and the chat's card read "Check result · Didn't pass" in red.
  it("says an unconfirmed result in the label the chat's card reads as not confirmed, never as failed", () => {
    const no = automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "no" }, basis: "model" });
    const yes = automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "yes" }, basis: "model" });
    const card = (words: ReturnType<typeof automationStudioResultCheckActivity>) => activityActionOf({ phase: "verifying", label: words.label, detail: { kind: "check", title: "Result check", status: words.status, text: words.text } });
    const unconfirmed = automationStudioResultCheckActivity(performed(automationStudioResultVerificationAgreement({ first: no, second: yes })));
    expect(unconfirmed.label).toBe(ACTIVITY_RESULT_CHECK_LABELS.unconfirmed);
    expect(card(unconfirmed)).toMatchObject({ kind: "result_check", unconfirmed: true });
    const refuted = automationStudioResultCheckActivity(performed(automationStudioResultVerificationAgreement({ first: no, second: no })));
    expect(card(refuted)).not.toHaveProperty("unconfirmed");
    expect(card(automationStudioResultCheckActivity(performed(yes)))).toMatchObject({ outcome: "done" });
  });

  // t193 1003 D10 (run-musp4h2f-72e8ed99, 20-failure-panel): inside a build the split card ended
  // "... and the run is not marked as failed for it", directly above an ending saying the build was
  // not finished. Inside a build it says what a split means there.
  it("says inside a build that checks which did not settle leave the build unable to finish on that test", () => {
    const no = automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "no" }, basis: "model" });
    const yes = automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "yes" }, basis: "model" });
    const unsure = automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "unknown" }, basis: "model" });
    const said = (first: typeof no, second: typeof no, kind: "build" | "run") => runWithAutomationStudioActivity({ kind, id: "u1", projectId: "p1" }, () => automationStudioResultCheckActivity(performed(automationStudioResultVerificationAgreement({ first, second, confirmAnswer: kind === "build" }))));
    for (const [first, second] of [[no, yes], [yes, no], [no, unsure]] as const) {
      const inBuild = said(first, second, "build");
      expect(inBuild.label).toBe(ACTIVITY_RESULT_CHECK_LABELS.unconfirmed);
      expect(inBuild.text).toMatch(/the build cannot finish on this test\.$/u);
      expect(inBuild.text).not.toMatch(/run is not marked as failed/u);
      // The rows that came back lead (t194-w81, U6), then the verdict's own sentence.
      expect(inBuild.text).toMatch(/^3 rows came back\. This result was checked twice with the same evidence/u);
      // A run's check keeps its own meaning: a run is not failed on checks that did not settle.
      if (first !== yes) expect(said(first, second, "run").text).toMatch(/the run is not marked as failed for it\.$/u);
    }
    // Nothing else changes inside a build.
    expect(said(no, no, "build").text).toContain("judged not to answer the request");
  });

  // t194-w81 U6 (run-musp39u8-9ac026ab, moment 22): after the playback the card showed
  // the judges' text verbatim -- endView, reads.stop, pageLimit,
  // extractList.paginate.maxPages and node.bootstrap.64c205b534adb35d.main.s7 -- and
  // never how many rows came back. Expected, observed and advice are judge 0111's
  // reply as recorded (steps/0111-judge/response.txt).
  it("says the musp39u8 refusal with the 13 rows that came back and no internal names", () => {
    const node = "node.bootstrap.64c205b534adb35d.main.s7";
    const lane: AutomationStudioRunResultSummary = {
      ...summary,
      totalRecordCount: 13,
      flowShape: [
        { nodeId: "node.bootstrap.64c205b534adb35d.main.s1", definitionId: "web.output.browser-navigate" },
        { nodeId: node, definitionId: "web.output.dom-extract_list", parameters: { extractList: { paginate: { maxPages: 5 } } } }
      ],
      reads: [{ nodeId: node, definitionId: "web.output.dom-extract_list", pagesRead: 5, pageLimit: 5, stop: "control_disabled", truncated: false, itemsSeen: 94, kept: 13, paginates: true, dedupes: true, dedupeBy: ["url"] }]
    };
    const judged = automationStudioResultVerdict({
      summary: lane,
      basis: "model",
      diagnosis: {
        answersRequest: "no",
        expected: "Every Brightaisle Plus eligible wireless earbud rated 4.0+ and priced under $50, across all pages of the search results, excluding sponsored placements and accessories, deduped by url, in search order, with name, price, rating, url.",
        observed: "13 rows stored from 5 pages (94 items seen). endView shows page 5 of a result set reporting \"65-70 of over 1,000 results\" with Next disabled; reads.stop is control_disabled at pageLimit 5. Pages 6+ were never read, so qualifying pairs there are missing.",
        changed: `Raise extractList.paginate.maxPages on ${node} (currently 5) so paging continues until the Next control is disabled, covering all result pages.`
      }
    });
    const outcome = performed(automationStudioResultVerificationAgreement({ first: judged, second: judged }));
    const words = automationStudioResultCheckActivity(outcome);
    expect(words.label).toBe(ACTIVITY_RESULT_CHECK_LABELS.refuted);
    expect(words.status).toBe("failed");
    expect(words.text).toMatch(/^13 rows came back\./u);
    expect(words.text).toContain("judged not to answer the request");
    expect(words.text).toContain("Pages 6+ were never read");
    expect(words.text).toContain("across all pages of the search results");
    for (const internal of ["endView", "reads.stop", "pageLimit", "maxPages", "extractList", "control_disabled", "node.bootstrap", "64c205b534adb35d", "main.s7", "Raise"]) {
      expect(words.text).not.toContain(internal);
    }
    expect(words.text).not.toMatch(/[A-Za-z_][\w-]+\.[A-Za-z_][\w-]+/u);
    // Only what the person sees changed: the record and the repair's inputs carry the judge's words as before.
    expect(outcome.performed && outcome.repair?.judgement?.advice).toContain("extractList.paginate.maxPages");
  });

  it("says no rows came back, and one row in the singular", () => {
    const none = automationStudioResultVerdict({ summary: { ...summary, totalRecordCount: 0 }, diagnosis: { answersRequest: "no" }, basis: "model" });
    expect(automationStudioResultCheckActivity(performed(none)).text).toMatch(/^No rows came back\./u);
    const one = automationStudioResultVerdict({ summary: { ...summary, totalRecordCount: 1 }, diagnosis: { answersRequest: "yes" }, basis: "model" });
    expect(automationStudioResultCheckActivity(performed(one)).text).toBe("1 row came back. The result was judged to answer the request.");
  });
});
