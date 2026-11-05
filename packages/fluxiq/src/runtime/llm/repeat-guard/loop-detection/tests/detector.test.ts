// The detector's rules over plain facts, the words it may say, and the ladder
// run over a recording.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { personFacingTextFaults } from "../../../../../ui/index.ts";
import {
  AUTOMATION_STUDIO_LLM_LOOP_PATTERNS,
  automationStudioLlmLoopAttemptRecord,
  automationStudioLlmLoopCallKey,
  automationStudioLlmLoopChatWords,
  automationStudioLlmLoopDetector,
  automationStudioLlmLoopMeaningfulInput,
  automationStudioLlmLoopRefusalInstruction,
  automationStudioLlmLoopReplay,
  automationStudioLlmLoopRowDigests,
  automationStudioLlmLoopSteerNote,
  automationStudioLlmLoopWatch,
  type AutomationStudioLlmLoopCall,
  type AutomationStudioLlmLoopReplayEvent
} from "../index.ts";

const detector = () => automationStudioLlmLoopDetector({ record: automationStudioLlmLoopAttemptRecord() });
const press = (index: number, fields: Partial<AutomationStudioLlmLoopCall> = {}): AutomationStudioLlmLoopCall => ({ callId: `c${index}`, toolId: "press", input: { target: "X" }, effect: "mutate", effectApplied: false, refused: true, stateBefore: "s1", stateAfter: "s1", ...fields });

describe("what a call asks", () => {
  it("takes out the narrative members at any depth, never what a node acts with", () => {
    expect(automationStudioLlmLoopMeaningfulInput({ reason: "a", summary: "b", briefs: [{ reason: "c", kind: "work" }], parameters: { note: "typed", reason: "typed too" } }))
      .toEqual({ briefs: [{ kind: "work" }], parameters: { note: "typed", reason: "typed too" } });
    expect(automationStudioLlmLoopCallKey("t", { target: "X", reason: "one" })).toBe(automationStudioLlmLoopCallKey("t", { reason: "two", target: "X" }));
    expect(automationStudioLlmLoopCallKey("t", { target: "X" })).not.toBe(automationStudioLlmLoopCallKey("t", { target: "Y" }));
    expect(automationStudioLlmLoopCallKey("t", { target: "X" }, "draft 1")).not.toBe(automationStudioLlmLoopCallKey("t", { target: "X" }, "draft 2"));
  });

  it("reads rows only where the domain or Core says they are, as digests", () => {
    const rows = automationStudioLlmLoopRowDigests({ read: { extracted: [{ name: "a value on a page" }] } }, "read.extracted");
    expect(rows).toHaveLength(1);
    expect(rows?.[0]).not.toContain("value");
    expect(automationStudioLlmLoopRowDigests({ readRows: { rows: [{ a: 1 }, { a: 2 }] } })).toHaveLength(2);
    expect(automationStudioLlmLoopRowDigests({ read: { extracted: [] } })).toBeUndefined();
    expect(automationStudioLlmLoopRowDigests("plain words", "read.extracted")).toBeUndefined();
  });

  it("leaves what a read mints out of a row, so the same rows read again are not new, and keeps a row that holds nothing else", () => {
    const read = (...rows: JsonObject[]) => automationStudioLlmLoopRowDigests({ read: { extracted: rows } }, "read.extracted");
    expect(read({ title: "Oak", $handle: "t1", evidenceRef: "e1" })).toEqual(read({ title: "Oak", $handle: "t9", evidenceRef: "e9" }));
    expect(read({ title: "Oak", $row: 1 })).toEqual(read({ title: "Oak", $row: 2 }));
    expect(read({ title: "Oak", $handle: "t1" })).not.toEqual(read({ title: "Elm", $handle: "t1" }));
    expect(read({ handle: "@oak" })).not.toEqual(read({ handle: "@elm" }));
  });
});

describe("the detector", () => {
  it("does not call one failure a repeat", () => {
    expect(detector().ran(press(1)).finding).toBeUndefined();
  });

  describe("a call that did nothing, with no page, and says what it stands for", () => {
    const refusedBy = (index: number, act = "act.one"): AutomationStudioLlmLoopCall => ({ callId: `c${index}`, toolId: "press", input: { target: { handle: `t${index}` } }, ranAs: { act }, effect: "mutate", effectApplied: false, refused: false });

    it("is the same call however it was asked, where the caller can act on what that leads to", () => {
      const watching = automationStudioLlmLoopDetector({ record: automationStudioLlmLoopAttemptRecord(), judgesWithNoPage: true });
      expect(watching.ran(refusedBy(1)).finding).toBeUndefined();
      expect(watching.ran(refusedBy(2)).finding?.pattern).toBe("near_repeat");
      expect(watching.ran(refusedBy(3, "act.two")).finding).toBeUndefined();
    });

    it("is judged as it always was in another mode: not at all", () => {
      const watching = detector();
      for (const index of [1, 2, 3, 4]) expect(watching.ran(refusedBy(index))).toEqual({ progressed: false });
    });

    it("the ladder judges it only on the path that can answer what it leads to", () => {
      const onTheNewPath = automationStudioLlmLoopWatch({ refuseActs: true });
      onTheNewPath.ran(refusedBy(1));
      expect(onTheNewPath.ran(refusedBy(2))?.pattern).toBe("near_repeat");
      const elsewhere = automationStudioLlmLoopWatch();
      for (const index of [1, 2, 3, 4]) expect(elsewhere.ran(refusedBy(index))).toBeUndefined();
      expect(elsewhere.tally().steered).toBe(0);
    });

    it("a call that landed says nothing either way, on the new path too", () => {
      const watching = automationStudioLlmLoopDetector({ record: automationStudioLlmLoopAttemptRecord(), judgesWithNoPage: true });
      const landed = (index: number) => ({ ...refusedBy(index), effectApplied: true });
      expect(watching.ran(landed(1)).finding).toBeUndefined();
      expect(watching.ran(landed(2)).finding).toBeUndefined();
    });
  });

  it("drops a near repeat the repeat guard has lifted, so an identical call runs again from nothing", () => {
    const held = { value: true };
    const lifted = automationStudioLlmLoopDetector({ record: automationStudioLlmLoopAttemptRecord(), holds: () => held.value });
    lifted.ran(press(1), true);
    expect(lifted.ran(press(2), true).finding?.pattern).toBe("near_repeat");
    expect(lifted.repeating("press", { target: "X" }, undefined, "s1")?.pattern).toBe("near_repeat");
    held.value = false;
    expect(lifted.repeating("press", { target: "X" }, undefined, "s1")).toBeUndefined();
  });

  it("counts a call whose effect landed with no page reported as progress, and forgets what looks answered", () => {
    const watching = detector();
    const look = { callId: "l", toolId: "look", input: { q: "a" }, effect: "observe" as const, effectApplied: false, refused: false, stateBefore: "s1", stateAfter: "s1", answer: "same" };
    watching.ran(look);
    expect(watching.ran(look).finding?.pattern).toBe("near_repeat");
    expect(watching.ran({ callId: "t", toolId: "trial", input: { revision: 1 }, effect: "mutate", effectApplied: true, refused: false }).progressed).toBe(true);
    expect(watching.ran({ ...look, stateBefore: "s1", stateAfter: "s1" }).finding).toBeUndefined();
  });

  it("a read on one page that keeps bringing new rows is progress, and the same rows again is not", () => {
    const watching = detector();
    const read = (rows: string[]) => ({ callId: "r", toolId: "read", input: { list: "a" }, effect: "observe" as const, effectApplied: true, refused: false, stateBefore: "s1", stateAfter: "s1", rows });
    expect(watching.ran(read(["one"])).progressed).toBe(true);
    expect(watching.ran(read(["one", "two"])).progressed).toBe(true);
    expect(watching.ran(read(["two", "one"])).progressed).toBe(false);
    expect(watching.ran(read(["one", "two"])).finding?.pattern).toBe("near_repeat");
  });

  it("a look that answers differently on the same page is not the same look again", () => {
    const watching = detector();
    const look = (answer: string) => ({ callId: "l", toolId: "look", input: { q: "a" }, effect: "observe" as const, effectApplied: false, refused: false, stateBefore: "s1", stateAfter: "s1", answer });
    watching.ran(look("one"));
    expect(watching.ran(look("two")).finding).toBeUndefined();
    expect(watching.ran(look("two")).finding?.pattern).toBe("near_repeat");
  });

  it("a Flow the draft stood at in an earlier context is known at once when an edit brings it back", () => {
    const record = automationStudioLlmLoopAttemptRecord();
    const first = automationStudioLlmLoopDetector({ record });
    first.amended({ key: "edit", draftBefore: "start", draftAfter: "tried", applied: 1, undone: false });
    const fresh = automationStudioLlmLoopDetector({ record: automationStudioLlmLoopAttemptRecord(record.data()) });
    expect(fresh.amended({ key: "other words, same result", draftBefore: "start", draftAfter: "tried", applied: 1, undone: false }).finding?.pattern).toBe("same_fix");
    expect(fresh.amended({ key: "a new edit", draftBefore: "tried", draftAfter: "never stood", applied: 1, undone: false }).progressed).toBe(true);
  });

  it("taking steps out, back through drafts only its calls built, is not the same fix; bringing one back is", () => {
    const watching = detector();
    const step = (index: number): AutomationStudioLlmLoopCall => ({ callId: `s${index}`, toolId: "go", input: { to: index }, effect: "mutate", effectApplied: true, refused: false, stateBefore: `p${index}`, stateAfter: `p${index + 1}`, draftKey: `d${index}` });
    for (const index of [0, 1, 2]) watching.ran(step(index));
    const edit = (key: string, draftBefore: string, draftAfter: string) => watching.amended({ key, draftBefore, draftAfter, applied: 1, undone: false });
    expect(edit("drop the third", "d2", "d1").finding).toBeUndefined();
    expect(edit("drop the second", "d1", "d0").finding).toBeUndefined();
    expect(edit("keep the second", "d0", "d1").finding).toMatchObject({ pattern: "same_fix", repeats: 2 });
  });
});

describe("a look around an act", () => {
  const look = (index: number, page = "s1") => ({ callId: `l${index}`, toolId: "look", input: { q: "list" }, effect: "observe" as const, effectApplied: false, refused: false, stateBefore: page, stateAfter: page, answer: "same" });
  const go = (index: number, to: string, before: string, after: string) => ({ callId: `g${index}`, toolId: "go", input: { to }, effect: "mutate" as const, effectApplied: true, refused: false, stateBefore: before, stateAfter: after });

  it("a look asked again after a reload of the same page is a fresh look", () => {
    const watching = detector();
    watching.ran(look(1));
    watching.ran(go(1, "here", "s1", "s1"));
    expect(watching.ran(look(2)).finding).toBeUndefined();
  });

  it("the cycle a look is part of refuses only its acts", () => {
    const watching = detector();
    for (const pass of [1, 2]) {
      watching.ran(look(pass));
      watching.ran(go(pass, "there", "s1", "s2"));
      const last = watching.ran(go(pass, "back", "s2", "s1"));
      if (pass === 2) expect(last.finding?.pattern).toBe("cycle");
    }
    expect(watching.repeating("look", { q: "list" }, undefined, "s1")).toBeUndefined();
    expect(watching.repeating("go", { to: "there" }, undefined, "s1")?.pattern).toBe("cycle");
  });
});

describe("the attempt's record", () => {
  it("holds what came to nothing and what it was caught in, and only digests, tool ids and closed words", () => {
    const record = automationStudioLlmLoopAttemptRecord();
    const watching = automationStudioLlmLoopDetector({ record });
    const secret = { target: "a value on a page", reason: "the words of the model" };
    watching.ran(press(1, { input: secret }));
    watching.ran(press(2, { input: { ...secret, reason: "other words" } }));
    const data = record.data();
    expect(data.tried).toEqual([{ kind: "call", key: automationStudioLlmLoopCallKey("press", secret), toolId: "press", outcome: "failed", times: 2, pattern: "near_repeat" }]);
    expect(JSON.stringify(data)).not.toMatch(/a value on a page|the words of the model|other words/u);
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });
});

describe("the words", () => {
  const finding = (pattern: (typeof AUTOMATION_STUDIO_LLM_LOOP_PATTERNS)[number]) => ({ pattern, repeats: 3, toolIds: ["press"], unchanged: ["page", "rows", "acts", "draft"] as const });

  it("a person's words for every pattern pass the guard every sentence a person reads goes through", () => {
    for (const pattern of AUTOMATION_STUDIO_LLM_LOOP_PATTERNS) {
      const { title, text } = automationStudioLlmLoopChatWords(finding(pattern));
      expect(personFacingTextFaults(title)).toEqual([]);
      expect(personFacingTextFaults(text)).toEqual([]);
      expect(text).not.toMatch(/near_repeat|no_progress|same_fix|exact_repeat|repeat_refused|\bcycle\b/u);
    }
  });

  it("a loop that drafts nothing is never told to amend a draft, and every note says how many times", () => {
    for (const pattern of AUTOMATION_STUDIO_LLM_LOOP_PATTERNS) {
      const steer = String(automationStudioLlmLoopSteerNote(finding(pattern), "undrafted").instruction);
      expect(steer).not.toContain("amend");
      expect(steer).toMatch(/3 /u);
      expect(automationStudioLlmLoopRefusalInstruction(finding(pattern), "undrafted")).not.toContain("amend");
      expect(automationStudioLlmLoopRefusalInstruction(finding(pattern), "drafted")).toContain("amend the draft");
    }
  });
});

describe("the ladder over a recording", () => {
  // The shape of the two runs that made the guard, with their digests made up.
  const recordedPresses: AutomationStudioLlmLoopReplayEvent[] = Array.from({ length: 20 }, (_, index) => ({
    kind: "call", step: index + 1, proposes: true, resultCode: "web.action.rejected.target_covered", answerText: JSON.stringify({ ok: false, attempt: index }),
    call: press(index, { input: { target: "X", reason: `try ${index}` }, answer: `a${index}` })
  }));

  it("catches a button pressed twenty times with its words changed: steers, refuses, and would have stopped it", () => {
    const { firings, tally } = automationStudioLlmLoopReplay(recordedPresses);
    expect(firings[0]).toMatchObject({ step: 2, rung: "steer", pattern: "near_repeat", repeats: 2 });
    expect(firings[1]).toMatchObject({ step: 3, rung: "refuse", pattern: "near_repeat" });
    expect(firings.some((firing) => firing.rung === "change_approach")).toBe(true);
    expect(tally.caught.near_repeat).toBe(1);
  });

  it("catches one read rerun eight times on an unchanged page with the same rows", () => {
    const events: AutomationStudioLlmLoopReplayEvent[] = Array.from({ length: 8 }, (_, index) => ({
      kind: "call", step: index + 1, proposes: true, resultCode: "web.inspect.succeeded", answerText: "{}",
      call: { callId: `r${index}`, toolId: "read", input: { list: "results" }, effect: "observe", effectApplied: true, refused: false, stateBefore: "s1", stateAfter: "s1", rows: ["row a", "row b"], answer: "same" }
    }));
    const { firings, tally } = automationStudioLlmLoopReplay(events);
    expect(tally.caught.exact_repeat + tally.caught.near_repeat).toBeGreaterThan(0);
    expect(firings.length).toBeGreaterThan(0);
  });

  it("fires on nothing when each call brings new rows from a new page", () => {
    const events: AutomationStudioLlmLoopReplayEvent[] = Array.from({ length: 30 }, (_, index) => ({
      kind: "call", step: index + 1, proposes: true, resultCode: "web.inspect.succeeded", answerText: `{"page":${index}}`,
      call: { callId: `r${index}`, toolId: "read", input: { list: "results", paginate: true }, effect: "observe", effectApplied: true, refused: false, stateBefore: `p${index}`, stateAfter: `p${index + 1}`, rows: [`row ${index}`], answer: `a${index}` }
    }));
    const { firings } = automationStudioLlmLoopReplay(events);
    expect(firings).toEqual([]);
  });
});
