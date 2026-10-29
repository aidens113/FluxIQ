import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioTrialChangeBegin, automationStudioTrialChangeSteps, type AutomationStudioTrialChangeLedgerPort, type AutomationStudioTrialLatestRead, type AutomationStudioTrialWitnessPlace } from "../index.ts";

// The session a live trial is judged by its change in (t775 D1), over a fake ledger port: witnesses from the steps'
// stamps, the before reading from a fresh latest read or Core's look, the after reading from a look worded against the
// before state, and each part's proof.

type Rows = Record<string, string>;
/** A fake port over one list at one location: what Core's look reads there is `site`, with lines when it is given a start. */
function fakePort(initial: { rows: Rows; fresh: boolean }, left: string[] = []) {
  let seq = 1;
  let site = initial.rows;
  let latest: AutomationStudioTrialLatestRead = { reading: { source: "latest_read", location: "loc:list", collections: [{ scope: "p:list", group: "g:list", subjects: Object.keys(site), states: site }] }, state: { rows: site }, fresh: initial.fresh, seq };
  const port: AutomationStudioTrialChangeLedgerPort = {
    places: (witness) => ((witness as { ref?: string }).ref === "destination-1" ? [{ kind: "list", group: "g:list", location: "loc:list" } satisfies AutomationStudioTrialWitnessPlace] : []),
    latest: () => latest,
    seq: () => seq,
    leftFromEarlier: () => left.map((did) => ({ did })),
    carried: () => false
  };
  const looks: Array<{ location: string; start?: JsonObject }> = [];
  const look = async (location: string, start?: JsonObject) => {
    looks.push({ location, ...(start ? { start } : {}) });
    seq += 1;
    latest = { reading: { source: "latest_read", location, collections: [{ scope: "p:list", group: "g:list", subjects: Object.keys(site), states: site }], ...(start ? { lines: { gone: ["held 2"], added: ["held 3"] } } : {}) }, state: { rows: site }, fresh: true, seq };
  };
  return { port, look, looks, set: (rows: Rows) => { site = rows; } };
}
const steps = automationStudioTrialChangeSteps([{ key: "hold", nodes: [{ key: "n1", definitionId: "library.hold", definitionVersion: "1", consequences: ["create_new"], resetWitness: { via: "destination", ref: "destination-1" } }, { key: "n2", definitionId: "library.read", definitionVersion: "1", consequences: [] }] }], () => ["p1"]);

describe("a live trial's change session (t775 D1)", () => {
  it("reads before by Core's look where the latest read is stale, after by a look worded against it, and proves a change part shown", async () => {
    const fake = fakePort({ rows: { "s:a": "v:1", "s:b": "v:1" }, fresh: false });
    const session = await automationStudioTrialChangeBegin({ steps, parts: [{ id: "p1", effect: { kind: "change", direction: "adds", count: 1, what: "hold on a book" } }], port: fake.port, look: fake.look });
    expect(fake.looks).toEqual([{ location: "loc:list" }]);
    fake.set({ "s:a": "v:1", "s:b": "v:1", "s:c": "v:1" });
    const { siteChange, findings } = await session!.finish([{ step: 1, definitionId: "library.hold", witness: { via: "destination", ref: "destination-1" }, outcome: "changed" }]);
    expect(fake.looks[1]).toEqual({ location: "loc:list", start: { rows: { "s:a": "v:1", "s:b": "v:1" } } });
    expect(siteChange.witnesses[0]).toMatchObject({ id: "w1", steps: [1], parts: ["p1"], before: { source: "core_look", rows: 2 }, after: { source: "core_look", rows: 3 }, change: { added: 1, removed: 0, lines: { gone: ["held 2"], added: ["held 3"] } } });
    expect(siteChange.proofs).toEqual([{ part: "p1", effect: { kind: "change", direction: "adds", count: 1, what: "hold on a book" }, proof: "shown", steps: [1] }]);
    expect(findings).toEqual([]);
  });

  it("reads before from a fresh latest read with no look, and an unchanged witness is no_change with its finding", async () => {
    const fake = fakePort({ rows: { "s:a": "v:1" }, fresh: true });
    const session = await automationStudioTrialChangeBegin({ steps, parts: [{ id: "p1", effect: { kind: "change", direction: "adds", count: 1, what: "hold" } }], port: fake.port, look: fake.look });
    expect(fake.looks).toEqual([]);
    const { siteChange, findings } = await session!.finish([]);
    expect(siteChange.witnesses[0]).toMatchObject({ before: { source: "latest_read" }, change: { added: 0, changed: 0, removed: 0 } });
    expect(siteChange.proofs[0]).toMatchObject({ proof: "no_change" });
    expect(findings).toEqual([{ code: "result.change_not_seen", part: "p1" }]);
  });

  it("says an act already in the asked state apart, attributed to its step's witness by definition", async () => {
    const fake = fakePort({ rows: { "s:a": "v:1" }, fresh: true });
    const session = await automationStudioTrialChangeBegin({ steps, parts: [], port: fake.port, look: fake.look });
    const { siteChange } = await session!.finish([{ step: 2, definitionId: "library.hold", pass: { number: 1, of: 2 }, row: "first row", outcome: "already_in_state" }]);
    expect(siteChange.acts).toEqual([{ step: 2, pass: { number: 1, of: 2 }, row: "first row", outcome: "already_in_state", witness: "w1", parts: ["p1"] }]);
  });

  it("begins nothing where the trial has no witness and nothing of the build is on the site; leftovers alone begin one", async () => {
    const none = fakePort({ rows: {}, fresh: true });
    expect(await automationStudioTrialChangeBegin({ steps: [], parts: [], port: none.port, look: none.look })).toBeUndefined();
    const left = fakePort({ rows: {}, fresh: true }, ["an earlier act"]);
    const session = await automationStudioTrialChangeBegin({ steps: [], parts: [], port: left.port, look: left.look });
    expect((await session!.finish([])).siteChange.leftFromEarlier).toEqual([{ did: "an earlier act" }]);
  });
});

// t796: the steps the trial's act ledger says were not run reach the part proofs, never the packet's acts or witnesses.
describe("a live trial's change session with steps not run (t796)", () => {
  const keyed = automationStudioTrialChangeSteps([{ key: "hold", nodes: [{ key: "n1", label: "place a hold", definitionId: "library.hold", definitionVersion: "1", consequences: ["create_new"], resetWitness: { via: "destination", ref: "destination-1" } }, { key: "n2", definitionId: "library.read", definitionVersion: "1", consequences: [] }] }], () => ["p1"]);
  const notRun = { outcome: "not_run" as const, definitionId: "library.hold", key: "n1", lasting: true, notRun: { nodeId: "node.hold", label: "place a hold", reason: "guarded" as const, after: "close the library banner", passes: [1, 2, 3], of: 3 } };

  it("carries the plan key on each step", () => {
    expect(keyed.map((step) => step.key)).toEqual(["n1", "n2"]);
  });

  it("proves a part whose hold step a guard went past on every pass not_run, naming it, with no act and no finding", async () => {
    const fake = fakePort({ rows: { "s:a": "v:1" }, fresh: true });
    const session = await automationStudioTrialChangeBegin({ steps: keyed, parts: [{ id: "p1", effect: { kind: "change", direction: "adds", count: 3, what: "a hold on each book" } }], port: fake.port, look: fake.look });
    const { siteChange, findings } = await session!.finish([notRun]);
    expect(siteChange.acts).toEqual([]);
    expect(siteChange.witnesses[0]).toMatchObject({ steps: [] });
    expect(siteChange.proofs).toEqual([{ part: "p1", effect: { kind: "change", direction: "adds", count: 3, what: "a hold on each book" }, proof: "not_run", steps: [], notRun: [notRun.notRun] }]);
    expect(findings).toEqual([]);
  });

  it("matches a not-run step to the plan's only by its definition, key and label", async () => {
    const fake = fakePort({ rows: { "s:a": "v:1" }, fresh: true });
    const session = await automationStudioTrialChangeBegin({ steps: keyed, parts: [{ id: "p1", effect: { kind: "change", direction: "adds", count: 3, what: "holds" } }], port: fake.port, look: fake.look });
    const { siteChange } = await session!.finish([{ ...notRun, key: "n9" }]);
    expect(siteChange.proofs[0]).toMatchObject({ proof: "no_change" });
    expect(siteChange.proofs[0]).not.toHaveProperty("notRun");
  });
});
