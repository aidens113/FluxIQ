import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowArtifact } from "../../../../model/index.ts";
import type { AutomationStudioGraphExecutionTrace } from "../../../executor/index.ts";
import { AutomationStudioFlowCandidateTrialGate, type AutomationStudioFlowCandidate } from "../../../flow-bootstrap/candidate/index.ts";
import { automationStudioCandidateTrialFeedback } from "../index.ts";

// t426: the model never reads how a control was found (user, 2026-10-10: "the LLM model shouldnt have to worry about
// any of that, that's all handled by extension"). Every failure below is shaped like a real one -- paid run R4a's
// not-found step (`#fb1l6ufkg`, an element fingerprint, 3 same-family controls, best scored 0.27), an ambiguous target
// named by class tokens and scores, and assertion failures that quote the selector they checked -- and every word the
// trial feedback and the trial gate say about it is held to one screen. The site and steps are a theatre's seat
// booking, chosen to be unlike any realistic scenario.

type Attempt = AutomationStudioGraphExecutionTrace["attempts"][number];
type Failure = NonNullable<Attempt["failure"]>;

/** What the model must never read: a `#id` or `.class` token, a match score, or a word for how a control is found. */
const LEAKS: ReadonlyArray<readonly [string, RegExp]> = [
  ["an id token", /(?<![\w.])#[A-Za-z_][\w-]*/u],
  ["a class token", /(?<![\w.])\.[A-Za-z_][\w-]*/u],
  ["a decimal score", /(?<![\w$])-?[01]\.\d{2}(?!\d)/u],
  ["a word for the finding", /selector|fingerprint|address/iu]
];

function leaks(text: string): string[] {
  return LEAKS.filter(([, shape]) => shape.test(text)).map(([name, shape]) => `${name}: ${text.match(shape)?.[0]}`);
}

const graph = {
  nodes: [
    { id: "open", definitionId: "web.output.browser-navigate", label: "open the seating plan", parameterValues: { url: "http://theatre.test/plan" } },
    { id: "seat", definitionId: "web.output.dom-click", label: "choose a seat", parameterValues: { selector: "#fb1l6ufkg", element: { tagName: "label", visibleText: "Row F seat 12", fingerprint: { id: "fb1l6ufkg", classes: ["seat-option"] } } } },
    { id: "check", definitionId: "web.output.dom-assert", label: "check the booking reference", parameterValues: { selector: "#booking-ref", assert: { conditions: [{ kind: "exists" }] } } }
  ]
} as unknown as AutomationStudioFlowArtifact;

const open: Attempt = { attemptId: "a0", nodeId: "open", definitionId: "web.output.browser-navigate", startedAt: 1, status: "succeeded", inputs: {}, outputs: {}, effects: [] };
const tried = (nodeId: "seat" | "check", attemptId: string, failure: Failure, resolution?: JsonObject): Attempt => ({
  attemptId, nodeId, definitionId: nodeId === "seat" ? "web.output.dom-click" : "web.output.dom-assert", startedAt: 2, status: "failed", inputs: {}, effects: [], failure: { ...failure },
  message: `Target not found: selector ${nodeId === "seat" ? "#fb1l6ufkg" : "#booking-ref"} matched nothing.`,
  outputs: { ok: false, result: { result: { status: "failed", ...(resolution ? { resolution } : {}) } } }
});

/** R4a's not-found failure, word for word, and the measurement that says the control is still on the page. */
const r4aNotFound: Failure = {
  category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution",
  expected: "an element matching selector #fb1l6ufkg, element fingerprint",
  actual: "nothing matched; 3 control(s) of the same family are on the page; best scored 0.27"
};
const onPage = { strategy: "fingerprint", candidateCount: 3, bestScore: 0.27, runnerUpScore: 0.02, confidence: 0.6 };

const failures: ReadonlyArray<readonly [string, Attempt[]]> = [
  ["a not-found step whose control is on the page (R4a)", ["t1", "t2", "t3", "t4"].map((id) => tried("seat", id, r4aNotFound, onPage))],
  ["a not-found step that scored nothing", [tried("seat", "t1", { ...r4aNotFound, actual: "nothing matched; 3 control(s) of the same family are on the page" }, { strategy: "fingerprint", candidateCount: 3 })]],
  ["an ambiguous step named by class tokens and scores", [tried("seat", "t1", {
    category: "target_ambiguous", code: "web.target.ambiguous", retryable: false, stage: "target_resolution",
    expected: "one element matching selector .seat-option, element fingerprint",
    actual: "no exact match; 3 scored candidate(s) tied: label.seat-option \"Row F seat 12\" (0.41), label.seat-option \"Row F seat 13\" (0.40), label.seat-option \"Row F seat 14\" (0.39)"
  }, { strategy: "scored-candidate", candidateCount: 3, bestScore: 0.41, runnerUpScore: 0.40 })]],
  ["an assertion that quotes the id it checked", [tried("check", "t1", {
    category: "expected_state_missing", code: "web.validation.failed", retryable: false, stage: "verification",
    expected: "an element matching \"#booking-ref\" exists", actual: "nothing matched \"#booking-ref\""
  })]],
  ["an assertion that quotes the class it checked", [tried("check", "t1", {
    category: "unexpected_state", code: "web.validation.failed", retryable: false, stage: "verification",
    expected: "no element matches \".spinner-overlay\"", actual: "\".spinner-overlay\" is still present"
  })]],
  ["an assertion that names the selector it lacked", [tried("check", "t1", {
    category: "action_failed", code: "web.action.invalid", retryable: false,
    expected: "an element to test for existence", actual: "the action named no selector and no element"
  })]],
  ["a timeout that quotes a score", [tried("seat", "t1", {
    category: "timeout", code: "web.action.timeout", retryable: true, stage: "execution",
    expected: "the press to land", actual: "the closest control scored 0.12 and the wait ran out"
  })]]
];

const feedbackFor = (attempts: Attempt[]): JsonObject => automationStudioCandidateTrialFeedback.executionFailed({
  code: "candidate.execution_incomplete", start: "reset", graph,
  trace: { status: "failed", startedAt: 1, values: {}, effects: [], attempts: [{ ...open }, ...attempts] }
}).feedback;

describe("what the model reads about a failed trial step never says how a control was found", () => {
  it.each(failures)("trial feedback for %s", (_name, attempts) => {
    const feedback = feedbackFor(attempts);
    expect((feedback.steps as JsonObject[]).at(-1)).toMatchObject({ status: "failed" });
    expect(leaks(JSON.stringify(feedback))).toEqual([]);
  });

  it.each(failures)("the trial gate's answers for %s, tested again until the revision closes", async (_name, attempts) => {
    const candidate = { revision: 2, digest: "5e1f0c2a" } as unknown as AutomationStudioFlowCandidate;
    const gate = new AutomationStudioFlowCandidateTrialGate({
      latest: () => candidate,
      trial: { candidateId: "candidate.seats", port: async () => ({ revision: 2, digest: "5e1f0c2a", verdict: "execution_failed", trialRunId: "trial", feedback: feedbackFor(attempts) }) }
    });
    const said: unknown[] = [];
    for (let trial = 0; trial < 3; trial++) said.push((await gate.test({ revision: 2, digest: "5e1f0c2a" })).evidence);
    said.push(gate.completion({ revision: 2, digest: "5e1f0c2a" }));
    expect(leaks(JSON.stringify(said))).toEqual([]);
  });

  it("still says what a failure's own texts say when nothing in them is about finding a control", () => {
    const step = (feedbackFor([tried("check", "t1", {
      category: "expected_state_missing", code: "web.validation.failed", retryable: false, stage: "verification",
      expected: "the booking shows 2 seats", actual: "the booking shows 1 seat"
    })]).steps as JsonObject[]).at(-1)!;
    expect(step).toMatchObject({ expected: "the booking shows 2 seats", actual: "the booking shows 1 seat" });
  });

  it("says plainly that a control still on the page could not be found where it was saved, and nothing more", () => {
    const step = (feedbackFor(failures[0]![1]).steps as JsonObject[]).at(-1)!;
    expect(step).toMatchObject({
      label: "choose a seat", control: "Row F seat 12", targetOnPage: true, retryable: true,
      onPage: "Step 2 (\"choose a seat\") could not find its control \"Row F seat 12\" where it was saved, though one like it is on the page. The step itself is right."
    });
    expect(step).not.toHaveProperty("expected");
    expect(step).not.toHaveProperty("actual");
  });
});
