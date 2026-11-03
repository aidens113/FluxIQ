import { describe, expect, it } from "vitest";
import {
  automationStudioTrialChangeSteps,
  automationStudioTrialChangeUnwitnessedOutcome,
  automationStudioTrialChangeUnwitnessedSession,
  automationStudioTrialUnwitnessedOf,
  type AutomationStudioTrialChangeOutcome,
  type AutomationStudioTrialChangeSession
} from "../index.ts";

// A trial that runs steps with no witness (t791 fix 4): the admission's note as a gate reads it, the gap said in the
// judge's packet with the parts those steps serve left `unproven`, and a session even where nothing else is read.
// Made-up fixtures only: a forum where a step follows an author (no witness) and another replies in a thread (a list).

const steps = automationStudioTrialChangeSteps([
  { key: "follow", nodes: [
    { key: "n1", definitionId: "forum.open_author", definitionVersion: "1", consequences: [] },
    { key: "n2", definitionId: "forum.follow", definitionVersion: "1", label: "follow the author", consequences: ["modify_existing"] }
  ] },
  { key: "reply", nodes: [{ key: "n3", definitionId: "forum.reply", definitionVersion: "1", consequences: ["create_new"], resetWitness: { via: "destination", ref: "destination-1" } }] }
], (key) => (key === "follow" ? ["p1"] : ["p2"]));
const FOLLOWED = { id: "p1", effect: { kind: "end_state" as const, state: "following the author" } };
const REPLIED = { id: "p2", effect: { kind: "change" as const, direction: "adds" as const, count: 1, what: "reply in the thread" } };

describe("the admission's note of steps with no witness", () => {
  it("is read off an admission that carries one, and none off any other", () => {
    const note = { steps: [{ step: 2, label: "follow the author" }], instruction: "This trial ran with step 2." };
    expect(automationStudioTrialUnwitnessedOf({ kind: "admit", unwitnessed: note })).toEqual(note);
    expect(automationStudioTrialUnwitnessedOf({ kind: "admit" })).toBeUndefined();
    expect(automationStudioTrialUnwitnessedOf(undefined)).toBeUndefined();
    expect(automationStudioTrialUnwitnessedOf({ kind: "refuse", unwitnessed: note })).toBeUndefined();
    for (const malformed of [{ steps: [], instruction: "x" }, { steps: [{ step: "2" }], instruction: "x" }, { steps: [{ step: 2 }] }, [note]]) {
      expect(automationStudioTrialUnwitnessedOf({ kind: "admit", unwitnessed: malformed }), JSON.stringify(malformed)).toBeUndefined();
    }
  });
});

describe("the gap a step with no witness leaves in the judge's packet", () => {
  const outcome = (proofs: AutomationStudioTrialChangeOutcome["siteChange"]["proofs"], findings: AutomationStudioTrialChangeOutcome["findings"] = []): AutomationStudioTrialChangeOutcome => ({
    siteChange: { witnesses: [], acts: [], leftFromEarlier: [], proofs }, findings
  });

  it("names the step and the parts it serves, and leaves open a no only the places Core read made", () => {
    const read = outcome([
      { part: "p1", effect: FOLLOWED.effect, proof: "already_in_end_state", steps: [2] },
      { part: "p2", effect: REPLIED.effect, proof: "no_change", steps: [3] }
    ], [{ code: "result.change_not_seen", part: "p2" }]);
    // The run's feedback numbers the follow 4 (a start and a subflow call before it); the plan numbers it 2.
    const said = automationStudioTrialChangeUnwitnessedOutcome(read, { steps, unwitnessed: [2], acts: [{ step: 4, definitionId: "forum.follow" }, { step: 6, definitionId: "forum.reply" }] });
    expect(said.siteChange.unwitnessed).toMatchObject({ steps: [{ label: "follow the author", ranAs: [4] }], parts: ["p1"] });
    expect(said.siteChange.unwitnessed?.said).toContain("judge what they did by the run, its end view and each step's done-when check");
    expect(said.siteChange.proofs).toEqual([
      { part: "p1", effect: FOLLOWED.effect, proof: "unproven", steps: [2] },
      { part: "p2", effect: REPLIED.effect, proof: "no_change", steps: [3] }
    ]);
    expect(said.findings).toEqual([{ code: "result.change_not_seen", part: "p2" }]);
  });

  it("drops the not-seen finding of a part it leaves open, and keeps shown and contradicted proofs", () => {
    const allServed = automationStudioTrialChangeSteps([{ key: "all", nodes: [{ key: "n1", definitionId: "forum.follow", definitionVersion: "1", consequences: ["modify_existing"] }] }], () => ["p1", "p2", "p3"]);
    const read = outcome([
      { part: "p1", effect: REPLIED.effect, proof: "no_change", steps: [] },
      { part: "p2", effect: REPLIED.effect, proof: "shown", steps: [] },
      { part: "p3", effect: REPLIED.effect, proof: "contradicted", steps: [] }
    ], [{ code: "result.change_not_seen", part: "p1" }, { code: "result.change_contradicted", part: "p3", witness: "w1" }]);
    const said = automationStudioTrialChangeUnwitnessedOutcome(read, { steps: allServed, unwitnessed: [1], acts: [] });
    expect(said.siteChange.proofs.map((proof) => proof.proof)).toEqual(["unproven", "shown", "contradicted"]);
    expect(said.findings).toEqual([{ code: "result.change_contradicted", part: "p3", witness: "w1" }]);
  });

  it("is as it was when no step it names is among the trial's", () => {
    const read = outcome([{ part: "p2", effect: REPLIED.effect, proof: "no_change", steps: [3] }]);
    const said = automationStudioTrialChangeUnwitnessedOutcome(read, { steps, unwitnessed: [9], acts: [] });
    expect(said.siteChange).toBe(read.siteChange);
    expect(said.siteChange).not.toHaveProperty("unwitnessed");
  });
});

describe("the readings of a trial that runs a step with no witness", () => {
  it("without a session of its own, still tell the judge its acts, each typed part unproven, and the gap", async () => {
    const session = automationStudioTrialChangeUnwitnessedSession({ session: undefined, steps, parts: [FOLLOWED, REPLIED], unwitnessed: [2], leftFromEarlier: () => [{ did: "pressed \"Follow\" while exploring" }] });
    const { siteChange, findings } = await session.finish([{ step: 2, definitionId: "forum.follow", outcome: "changed" }]);
    expect(siteChange.witnesses).toEqual([]);
    expect(siteChange.acts).toEqual([{ step: 2, outcome: "changed", parts: ["p1"] }]);
    expect(siteChange.leftFromEarlier).toEqual([{ did: "pressed \"Follow\" while exploring" }]);
    expect(siteChange.proofs).toEqual([
      { part: "p1", effect: FOLLOWED.effect, proof: "unproven", steps: [2] },
      { part: "p2", effect: REPLIED.effect, proof: "unproven", steps: [] }
    ]);
    expect(findings).toEqual([]);
    expect((siteChange as { unwitnessed?: unknown }).unwitnessed).toMatchObject({ steps: [{ label: "follow the author", ranAs: [2] }], parts: ["p1"] });
  });

  it("with a session, finish it and say the gap over what it read", async () => {
    const asked: unknown[] = [];
    const inner: AutomationStudioTrialChangeSession = {
      async finish(acts) {
        asked.push(acts);
        return { siteChange: { witnesses: [], acts: [], leftFromEarlier: [], proofs: [{ part: "p1", effect: FOLLOWED.effect, proof: "already_in_end_state", steps: [2] }] }, findings: [] };
      }
    };
    const left = { calls: 0 };
    const leftFromEarlier = () => {
      left.calls += 1;
      return [];
    };
    const session = automationStudioTrialChangeUnwitnessedSession({ session: inner, steps, parts: [FOLLOWED], unwitnessed: [2], leftFromEarlier });
    const { siteChange } = await session.finish([{ step: 2, definitionId: "forum.follow", outcome: "changed" }]);
    expect(asked).toHaveLength(1);
    expect(left.calls).toBe(0);
    expect(siteChange.proofs[0]?.proof).toBe("unproven");
    expect((siteChange as { unwitnessed?: unknown }).unwitnessed).toMatchObject({ steps: [{ label: "follow the author", ranAs: [2] }], parts: ["p1"] });
  });
});
