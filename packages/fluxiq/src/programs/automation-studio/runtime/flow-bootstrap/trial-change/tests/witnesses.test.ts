import { describe, expect, it } from "vitest";
import { automationStudioTrialChangeActs, automationStudioTrialChangeBegin, automationStudioTrialChangeSteps, type AutomationStudioTrialChangeLedgerPort, type AutomationStudioTrialLatestRead, type AutomationStudioTrialWitnessPlace } from "../index.ts";

// A lasting step that ran in several passes of a loop (t787 fix 4): each pass acted at its own item, so each pass is its
// own control witness, at that pass's place and location, read from the pass's own diff. One witness per step put every
// pass at the first item, and a pass that took back what an earlier act had added at another item was covered by none.
// The fixtures are a library's: a shelf of books, each with its own "keep" toggle; never a realistic scenario's site.

const OFF = "st:off", ON = "st:on";
const counts = (state: string) => ({ [state]: 1, "st:other": 1 });

/** A fake ledger over the stamp's one control place `pl:a` at `loc:a`: read fresh before, and read again by Core's look after. */
function fakePort(start?: Record<string, Record<string, number>>) {
  let seq = 1;
  let latest: AutomationStudioTrialLatestRead = { reading: { source: "latest_read", location: "loc:a", controls: { "pl:a": counts(OFF) } }, state: { page: "a" }, fresh: true, seq };
  const port: AutomationStudioTrialChangeLedgerPort = {
    places: (witness) => ((witness as { ref?: string }).ref === "control-1" ? [{ kind: "control", place: "pl:a", location: "loc:a" } satisfies AutomationStudioTrialWitnessPlace] : []),
    latest: () => latest,
    seq: () => seq,
    leftFromEarlier: () => [],
    carried: () => false,
    ...(start ? { start: (place: string) => start[place] } : {})
  };
  const look = async (location: string) => {
    seq += 1;
    latest = { reading: { source: "latest_read", location, controls: { "pl:a": counts(ON) } }, state: { page: "a" }, fresh: true, seq };
  };
  return { port, look };
}

const stamp = { via: "control" as const, ref: "control-1" };
const steps = automationStudioTrialChangeSteps([{ key: "keep", nodes: [
  { key: "n1", definitionId: "library.read_shelf", definitionVersion: "1", consequences: [] },
  { key: "n2", definitionId: "library.keep", definitionVersion: "1", consequences: ["modify_existing"], resetWitness: stamp }
] }], () => ["p1"]);

/** One landed pass of the keep step at `item`, as `landed-acts.ts` reads it off the pass's own diff. */
const pass = (step: number, number: number, item: string, from: string, to: string) => ({
  step, definitionId: "library.keep", witness: stamp, pass: { number, of: 3 },
  spot: { place: `pl:${item}`, state: from }, controls: { page: `pg:${item}`, location: `loc:${item}`, before: counts(from), after: counts(to) }
});

describe("a looped lasting step's witnesses (t787 fix 4)", () => {
  it("gives a three-pass loop on three items three control witnesses, each at its own place and location", async () => {
    const fake = fakePort();
    const session = await automationStudioTrialChangeBegin({ steps, parts: [{ id: "p1", effect: { kind: "change", direction: "adds", count: 3, what: "kept books" } }], port: fake.port, look: fake.look });
    const acts = automationStudioTrialChangeActs([pass(3, 1, "a", OFF, ON), pass(5, 2, "b", OFF, ON), pass(7, 3, "c", OFF, ON)]);
    const { siteChange, findings } = await session!.finish(acts);
    expect(siteChange.witnesses.map(({ id, kind, where, steps: on }) => ({ id, kind, where, steps: on }))).toEqual([
      { id: "w1", kind: "control", where: "loc:a", steps: [3] },
      { id: "w2", kind: "control", where: "loc:b", steps: [5] },
      { id: "w3", kind: "control", where: "loc:c", steps: [7] }
    ]);
    expect(siteChange.acts.map(({ step, pass: of, witness }) => ({ step, pass: of, witness }))).toEqual([
      { step: 3, pass: { number: 1, of: 3 }, witness: "w1" },
      { step: 5, pass: { number: 2, of: 3 }, witness: "w2" },
      { step: 7, pass: { number: 3, of: 3 }, witness: "w3" }
    ]);
    // The stamp's own place keeps the trial's readings; the passes elsewhere are read by their own diffs.
    expect(siteChange.witnesses[0]).toMatchObject({ parts: ["p1"], before: { source: "latest_read" }, after: { source: "core_look" } });
    expect(siteChange.witnesses[1]).toMatchObject({ parts: ["p1"], before: { source: "step_diff" }, after: { source: "step_diff" }, change: { from: { "state 1": 1, "state 2": 0, "state 3": 1 }, to: { "state 1": 0, "state 2": 1, "state 3": 1 } } });
    expect(siteChange.proofs).toEqual([{ part: "p1", effect: { kind: "change", direction: "adds", count: 3, what: "kept books" }, proof: "shown", steps: [3, 5, 7] }]);
    expect(findings).toEqual([]);
  });

  it("is contradicted when one pass put its item back to how the build found it, at a place no other witness covers", async () => {
    // Item b was kept by an earlier trial of this build: the build found it off, so a pass that turns it off took back that keep.
    const fake = fakePort({ "pl:a": counts(OFF), "pl:b": counts(OFF) });
    const session = await automationStudioTrialChangeBegin({ steps, parts: [{ id: "p1", effect: { kind: "change", direction: "adds", count: 3, what: "kept books" } }], port: fake.port, look: fake.look });
    const { siteChange } = await session!.finish(automationStudioTrialChangeActs([pass(3, 1, "a", OFF, ON), pass(5, 2, "b", ON, OFF), pass(7, 3, "c", OFF, ON)]));
    expect(siteChange.witnesses.map((witness) => witness.where)).toEqual(["loc:a", "loc:b", "loc:c"]);
    expect(siteChange.proofs[0]).toMatchObject({ part: "p1", proof: "contradicted", steps: [3, 5, 7] });
  });

  it("keeps one witness for passes that acted at the same place, and an act with no diff on its stamp's witness", async () => {
    const fake = fakePort();
    const session = await automationStudioTrialChangeBegin({ steps, parts: [], port: fake.port, look: fake.look });
    const { siteChange } = await session!.finish(automationStudioTrialChangeActs([pass(3, 1, "b", OFF, ON), pass(5, 2, "b", ON, OFF), { step: 7, definitionId: "library.keep", witness: stamp, pass: { number: 3, of: 3 } }]));
    expect(siteChange.witnesses.map(({ id, where, steps: on }) => ({ id, where, steps: on }))).toEqual([{ id: "w1", where: "loc:a", steps: [7] }, { id: "w2", where: "loc:b", steps: [3, 5] }]);
    // Read on both sides by its passes' own diffs: before the first, after the last.
    expect(siteChange.witnesses[1]).toMatchObject({ change: "none" });
  });

  it("makes no witness from a passive step's own diff, so a state held before stays carried", async () => {
    // Step 1 reads the shelf and declares no lasting class; its press changed a control (an option chosen) at pl:z.
    // The stamp's place already shows the kept state before and after (Core's look reads it again), made earlier by this step.
    const fake = fakePort();
    let seq = 1;
    fake.port.latest = () => ({ reading: { source: "latest_read", location: "loc:a", controls: { "pl:a": counts(ON) } }, state: { page: "a" }, fresh: true, seq });
    fake.port.seq = () => seq;
    fake.port.carried = () => true;
    const look = async () => { seq += 1; };
    const session = await automationStudioTrialChangeBegin({ steps, parts: [{ id: "p1", effect: { kind: "end_state", state: "the book is kept" } }], port: fake.port, look });
    const chosen = { step: 1, definitionId: "library.read_shelf", spot: { place: "pl:z", state: OFF }, controls: { page: "pg:z", location: "loc:z", before: counts(OFF), after: counts(ON) } };
    const { siteChange } = await session!.finish(automationStudioTrialChangeActs([chosen, { step: 2, definitionId: "library.keep", witness: stamp }]));
    expect(siteChange.witnesses.map((witness) => witness.id)).toEqual(["w1"]);
    expect(siteChange.proofs[0]).toMatchObject({ part: "p1", proof: "carried" });
  });
});
