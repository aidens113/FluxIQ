// An execution-failed trial always says what stopped it (lane 3,
// `run-mvcvzwk1-c1d869e4`, steps 0083 and 0085): two trials came back
// `candidate.trial_port_failed` with nothing else, the instruction sent the
// builder to a failed step no feedback named, and it tested the same revision
// again, blind.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioFlowCandidateTrialGate, automationStudioCandidateTrialStop as Stop, type AutomationStudioCandidateTrialRequest, type AutomationStudioCandidateTrialResult, type AutomationStudioFlowCandidate } from "../index.ts";

const failed = (feedback: JsonObject) => ({ verdict: "execution_failed", feedback });
const read = { step: 6, definitionId: "web.output.dom-extract_list", label: "read the rows on the list", status: "succeeded" };
const onward = { step: 7, definitionId: "web.output.dom-press", label: "move the list on", status: "succeeded" };
/** Model guidance never mirrors a realistic Lab scenario (AGENTS.md); "digest" is the tool's own parameter. */
const LAB_TASK_WORDS = /friend|earbud|kettle|basket|cart\b|towel|napkin|watchlist|auction|coupon|invitation|classified|giveaway|group post|feed|circleway|brightaisle|farbazaar|voltbay|tidewell/iu;
const head = "The candidate did not run to its end, so this revision cannot complete.";
const tell = (feedback: JsonObject, retestable = true) => Stop.instruction(failed(feedback), { head, retestable, resubmit: "submit the whole candidate" });

describe("what stopped an execution-failed trial", () => {
  it("asks for preceding context when a later step fails, without assuming the failed step caused it", () => {
    const feedback = { steps: [
      { step: 1, definitionId: "builtin.data.choose", label: "choose a document", status: "succeeded" },
      { step: 2, definitionId: "builtin.data.lookup", label: "read its revision", status: "failed", failureCode: "record.not_found" }
    ] };
    for (const retestable of [true, false]) {
      const said = tell(feedback, retestable);
      expect(said).toContain('Step 2 ("read its revision") failed');
      expect(said).toContain("Trace the preceding steps");
      expect(said).toContain("compare the context they reached with what the failed step needs");
      expect(said).toContain("the cause may be an earlier step");
      expect(said).not.toContain("correct that step");
      expect(said).not.toContain("Correct that step");
      expect(said.includes("test this same revision again")).toBe(retestable);
      expect(said).not.toMatch(LAB_TASK_WORDS);
    }
    expect(Stop.of(feedback)).toMatchObject({ kind: "step", step: 2, failureCode: "record.not_found" });
  });

  it("names the failed step the run stopped at, how often it ran before, and what it saw", () => {
    const stop = Stop.of({ code: "candidate.execution_incomplete", steps: [read, onward, { ...read, step: 8 }, { ...onward, step: 9, status: "failed", failureCode: "web.target.not_found", actual: "The list had no further page." }] });
    expect(stop).toMatchObject({ kind: "step", step: 9, label: "move the list on", failureCode: "web.target.not_found", ranBefore: 1 });
    expect(String(stop.said)).toBe("Step 9 (\"move the list on\") failed, on its run 2 in this trial (it ran 1 time before, once a pass of the repeat it is in), and the run stopped there (web.target.not_found). What it saw: The list had no further page.");
  });

  it("names a repeat that ended for making no progress, in the loop's own words, and says testing it unchanged would stop the same way", () => {
    const actual = "Passes 2 to 4 of this repeat stored no new rows and left the page as it was, so the loop stopped before pass 5 instead of doing the same again.";
    const feedback = { code: "candidate.execution_incomplete", steps: [{ step: 14, definitionId: "builtin.control.repeat", status: "failed", failureCode: "repeat.no_progress", actual }] };
    const said = tell(feedback);
    expect(said.startsWith(`${head} Step 14 ended its repeat: ${actual}`)).toBe(true);
    expect(said).toContain("testing this revision unchanged would stop the same way");
    expect(said).toContain("its last step has to change the page, or answer ended when nothing more comes");
    expect(said).not.toMatch(LAB_TASK_WORDS);
  });

  it("says when the step that stopped the run is past the steps listed", () => {
    const steps = Array.from({ length: 40 }, (_, index) => ({ ...read, step: index + 1 }));
    expect(Stop.of({ code: "candidate.execution_incomplete", steps, stepsLeftOut: 46 })).toMatchObject({ kind: "steps_left_out", listed: 40, leftOut: 46, said: "The run took 86 steps and steps lists only the first 40, so the step that stopped it is not listed (candidate.execution_incomplete)." });
  });

  it("names a graph ending, a failed start, an answer Core could not read, and a stop between steps", () => {
    expect(Stop.of({ code: "candidate.execution_incomplete", steps: [read], graphEnding: { code: "executor.graph.unmatched_route", happened: "The last step chose a route with no matching outgoing edge." } })).toMatchObject({ kind: "graph", code: "executor.graph.unmatched_route" });
    expect(Stop.of({ code: "candidate.trial_start_failed", start: "failed" })).toMatchObject({ kind: "start", code: "candidate.trial_start_failed" });
    expect(Stop.of({ code: "candidate.trial_result_invalid" })).toMatchObject({ kind: "trial_runner", failure: "candidate.trial_result_invalid" });
    expect(Stop.of({ code: "candidate.execution_incomplete", steps: [read, onward] })).toMatchObject({ kind: "run", said: "No step of the Flow failed: the run stopped between steps, after step 2 (candidate.execution_incomplete)." });
  });

  it("names a trial runner that threw by its error's kind alone, never its text, and tells two such failures apart from one", () => {
    const feedback = Stop.portFailed("candidate.trial_port_failed", new TypeError("secret page text"));
    expect(feedback).toMatchObject({ code: "candidate.trial_port_failed", stoppedBy: { kind: "trial_runner", failure: "TypeError" } });
    expect(JSON.stringify(feedback)).not.toContain("secret page text");
    expect(Stop.portFailed("candidate.trial_port_failed", "a thrown string")).toMatchObject({ stoppedBy: { failure: "unknown error" } });
    expect(Stop.signature(failed(feedback))).toBe(Stop.signature(failed(Stop.portFailed("candidate.trial_port_failed", new TypeError("other text")))));
    expect(Stop.signature(failed(feedback))).not.toBe(Stop.signature(failed(Stop.portFailed("candidate.trial_port_failed", new RangeError("x")))));
    // An answer Core could not read is no evidence the next one will be the same.
    expect(Stop.signature(failed({ code: "candidate.trial_result_invalid" }))).toBeUndefined();
    const said = tell(feedback);
    expect(said).toContain("Core's own trial runner stopped with an error (TypeError)");
    expect(said).toContain("Nothing in this feedback points at a step to change");
    expect(said).not.toContain("Read the feedback for the step that failed");
  });

  it("adds what stopped it to an execution-failed answer's feedback only, keeping one already there", () => {
    expect(Stop.told(failed({ code: "candidate.execution_incomplete", steps: [read] })).feedback).toMatchObject({ stoppedBy: { kind: "run" } });
    expect(Stop.told({ verdict: "no", feedback: { said: "wrong" } }).feedback).toEqual({ said: "wrong" });
    const carried = { kind: "trial_runner", failure: "TypeError", said: "carried" };
    expect(Stop.told(failed({ code: "candidate.trial_port_failed", stoppedBy: carried })).feedback.stoppedBy).toEqual(carried);
  });
});

describe("the candidate trial gate, when its trial port throws", () => {
  const candidate = { revision: 1, digest: "a".repeat(64) } as AutomationStudioFlowCandidate;
  function gateThrowing(errors: Error[]) {
    const asked: AutomationStudioCandidateTrialRequest[] = [];
    const port = async (request: AutomationStudioCandidateTrialRequest): Promise<AutomationStudioCandidateTrialResult> => {
      asked.push(request);
      throw errors[asked.length - 1] ?? new Error("unused");
    };
    return { asked, gate: new AutomationStudioFlowCandidateTrialGate({ latest: () => candidate, trial: { candidateId: "candidate.one", port } }) };
  }
  const receipt = { revision: candidate.revision, digest: candidate.digest };

  it("says the trial runner failed, by kind, in the feedback the builder reads, and allows one more test, not a blind third", async () => {
    const { asked, gate } = gateThrowing([new TypeError("secret page text"), new TypeError("more page text")]);
    const first = (await gate.test(receipt)).evidence as JsonObject;
    expect(first).toMatchObject({ verdict: "execution_failed", retestsLeft: 2, feedback: { code: "candidate.trial_port_failed", stoppedBy: { kind: "trial_runner", failure: "TypeError" } } });
    expect(String(first.instruction)).toMatch(/^The candidate did not run to its end, so this revision cannot complete\. Core's own trial runner stopped with an error \(TypeError\)/u);
    const second = await gate.test(receipt);
    expect(second.evidence).toMatchObject({ verdict: "execution_failed", retestsLeft: 0, failedStep: { kind: "trial_runner", failure: "TypeError" } });
    expect(String((second.evidence as JsonObject).instruction)).toContain("Core's trial runner failed the same way in two trials of this revision");
    expect(second.resultReason).toBeUndefined();
    expect((await gate.test(receipt)).evidence).toMatchObject({ ok: false, code: "candidate.trial_same_failure" });
    expect(asked).toHaveLength(2);
    expect(gate.completion(receipt)).toMatchObject({ ok: false, feedback: { failedStep: { kind: "trial_runner" } } });
    expect(JSON.stringify([first, second.evidence])).not.toContain("page text");
  });

  it("keeps testing a runner that failed two different ways", async () => {
    const { gate } = gateThrowing([new TypeError("a"), new RangeError("b")]);
    await gate.test(receipt);
    expect((await gate.test(receipt)).evidence).toMatchObject({ verdict: "execution_failed", retestsLeft: 1 });
  });
});
