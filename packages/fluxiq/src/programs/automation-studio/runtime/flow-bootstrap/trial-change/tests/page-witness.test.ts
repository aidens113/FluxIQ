import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioSiteResetLedger, type AutomationStudioSiteResetExplored, type AutomationStudioSiteResetRead, type AutomationStudioSiteResetSpot } from "../../site-reset/index.ts";
import { automationStudioTrialDelta, type AutomationStudioTrialChangeAsk, type AutomationStudioTrialReading, type AutomationStudioTrialWitness } from "../index.ts";

// A page read whole witnesses a trial (t791 fix 1): the made item appearing on it, and a quantity it shows moving, are its
// change, and the proof is `shown`. Made-up fixtures: a library's reading shelf, a page of plain blocks that starts empty.

const TAB = "r:library-tab-1";
const SHELF = "loc:shelf";
/** "Add to reading shelf" on a book's own page. */
const BOOK: AutomationStudioSiteResetSpot = { subject: "s:atlas", page: "s:atlas", scope: "p:atlas-page", resource: TAB };
/** The shelf page: the subjects it shows and the values it shows (opaque), no list the domain vouches for. */
const shelf = (subjects: string[], values: Record<string, string> = {}, lines?: { gone: string[]; added: string[] }): AutomationStudioSiteResetRead => ({
  state: { page: "shelf", subjects, values }, differs: [], location: SHELF, scope: "p:shelf-page", resource: TAB, subjects, ...(Object.keys(values).length ? { values } : {}), ...(lines ? { lines } : {})
});
const add = (resetDestination?: string): AutomationStudioSiteResetExplored => ({
  callId: "shelve.atlas", toolId: "core.run_node", operation: "library.shelve", landed: true, ...(resetDestination ? { resetDestination } : {}),
  declared: { permitted: true, effect: "mutate", consequences: ["create_new"], control: { name: "Add to reading shelf", kind: "button", ...BOOK }, verb: "press" }
});
const compare = async () => ({ moved: false, differs: [] });

describe("a page witness's delta (t791)", () => {
  const witness: AutomationStudioTrialWitness = { id: "w1", kind: "list", group: "g:page", steps: [], parts: [] };
  const reading = (subjects: string[], values?: string): AutomationStudioTrialReading => ({ source: "core_look", collections: [{ scope: "p:page", group: "g:page", subjects, states: Object.fromEntries(subjects.map((subject) => [subject, "present"])), ...(values ? { values } : {}) }] });

  it("counts a subject appearing on an empty page as added", () => {
    expect(automationStudioTrialDelta(witness, reading([], "v:a"), reading(["s:atlas"], "v:b"))).toEqual({ witness: "w1", kind: "list", status: "changed", added: ["s:atlas"], removed: [], changed: [], unchanged: [] });
  });

  it("counts the values it shows moving, its subjects held still, as every subject changed", () => {
    expect(automationStudioTrialDelta(witness, reading(["s:atlas", "s:herbal"], "v:two-copies"), reading(["s:atlas", "s:herbal"], "v:three-copies"))).toEqual({ witness: "w1", kind: "list", status: "changed", added: [], removed: [], changed: ["s:atlas", "s:herbal"], unchanged: [] });
    expect(automationStudioTrialDelta(witness, reading([], "v:zero"), reading([], "v:one"))).toMatchObject({ status: "changed" });
  });

  it("is unchanged with the same subjects and values, and a list the domain read carries no values to compare", () => {
    expect(automationStudioTrialDelta(witness, reading(["s:atlas"], "v:a"), reading(["s:atlas"], "v:a"))).toMatchObject({ status: "unchanged", unchanged: ["s:atlas"] });
    expect(automationStudioTrialDelta(witness, reading(["s:atlas"]), reading(["s:atlas"], "v:a"))).toMatchObject({ status: "unchanged" });
  });
});

describe("a live trial witnessed by a page read whole (t791)", () => {
  it("issues the empty shelf a ref, admits the add naming it, and judges the trial's add on that page as shown", async () => {
    const ledger = new AutomationStudioSiteResetLedger({ owner: "brief-1" });
    ledger.observed(shelf([]));
    expect(ledger.destinationReceipts()).toEqual([{ ref: "destination-1", ordinal: 1, count: 0, page: true }]);
    expect(ledger.createBaseline(add("destination-1").declared!, "destination-1")).toEqual({ kind: "admit" });
    ledger.explored(add("destination-1"));
    // The plan step repeats the witnessed explored add; its stamp resolves to the shelf page.
    const stamp = ledger.admitStep({ effect: "mutate", consequences: ["create_new"], control: { name: "Add to reading shelf", kind: "button", ...BOOK } }, "library.shelve");
    expect(stamp).toEqual({ via: "repeats", act: "act-1" });
    ledger.observed(shelf(["s:atlas"], { "p:copies": "v:one" }));
    expect(ledger.destinationReceipts()).toEqual([{ ref: "destination-1", ordinal: 1, count: 0, page: true }]);
    let site = shelf(["s:atlas"], { "p:copies": "v:one" });
    const looked: string[] = [];
    const lookAt = async (location: string, start?: JsonObject) => {
      looked.push(location);
      ledger.observed({ ...site, ...(start ? { lines: { gone: ["Atlas: 1 copy"], added: ["Atlas: 2 copies"] } } : {}) });
    };
    const ask: AutomationStudioTrialChangeAsk = { steps: [{ step: 1, definitionId: "library.shelve", consequences: ["create_new"], witness: stamp, parts: ["p1"] }], parts: [{ id: "p1", effect: { kind: "change", direction: "adds", count: 1, what: "a copy of the atlas on the reading shelf" } }] };
    const decision = await ledger.beforeTrial({ compare, lookAt }, undefined, { change: ask });
    if (decision.kind !== "admit" || !decision.change) throw new Error("no readings were begun");
    // The trial adds one more copy: the shelf shows the same book, with another count.
    site = shelf(["s:atlas"], { "p:copies": "v:two" });
    const { siteChange, findings } = await decision.change.finish([{ step: 1, definitionId: "library.shelve", witness: stamp, outcome: "changed" }]);
    expect(looked.at(-1)).toBe(SHELF);
    expect(siteChange.witnesses).toEqual([{
      id: "w1", kind: "list", where: SHELF, steps: [1], parts: ["p1"],
      before: { source: "latest_read", rows: 1 }, after: { source: "core_look", rows: 1 },
      change: { added: 0, removed: 0, changed: 1, unchanged: 0, lines: { gone: ["Atlas: 1 copy"], added: ["Atlas: 2 copies"] } }
    }]);
    expect(siteChange.proofs).toEqual([{ part: "p1", effect: ask.parts[0]!.effect, proof: "shown", steps: [1] }]);
    expect(findings).toEqual([]);
    expect(JSON.stringify(siteChange)).not.toMatch(/s:atlas|p:shelf|v:two|page\\u0000/u);
  });

  it("shows the item appearing on a shelf that was empty before the trial, and the act settles once it is gone again", async () => {
    const ledger = new AutomationStudioSiteResetLedger({ owner: "brief-1" });
    ledger.observed(shelf([]));
    ledger.destinationReceipts();
    ledger.explored(add("destination-1"));
    expect(ledger.standing("act-1")).toBe("in_place");
    // Taken back while exploring: the shelf reads as the build found it, so the act is settled restored.
    ledger.observed(shelf(["s:atlas"]));
    ledger.explored({ callId: "unshelve", toolId: "core.run_node", operation: "library.unshelve", landed: true, undoes: "act-1", on: "subject", declared: { permitted: true, effect: "mutate", consequences: ["delete"], control: { name: "Remove", kind: "button", subject: "s:atlas", scope: "p:shelf-page", resource: TAB }, verb: "press" } });
    ledger.observed({ ...shelf([]), location: "loc:elsewhere" });
    ledger.observed(shelf([]));
    expect(ledger.standing("act-1")).toBe("restored");
    let site = shelf([]);
    const lookAt = async () => { ledger.observed(site); };
    const stamp = { via: "repeats", act: "act-1" };
    const decision = await ledger.beforeTrial({ compare, lookAt }, undefined, { change: { steps: [{ step: 1, definitionId: "library.shelve", consequences: ["create_new"], witness: stamp, parts: ["p1"] }], parts: [{ id: "p1", effect: { kind: "change", direction: "adds", count: 1, what: "the atlas on the reading shelf" } }] } });
    if (decision.kind !== "admit" || !decision.change) throw new Error("no readings were begun");
    site = shelf(["s:atlas"], { "p:copies": "v:one" });
    const { siteChange } = await decision.change.finish([{ step: 1, definitionId: "library.shelve", witness: stamp, outcome: "changed" }]);
    expect(siteChange.witnesses[0]).toMatchObject({ before: { rows: 0 }, after: { rows: 1 }, change: { added: 1, removed: 0, changed: 0, unchanged: 0 } });
    expect(siteChange.proofs[0]).toMatchObject({ part: "p1", proof: "shown" });
  });

  it("never lets a page ref read in another tab witness the press", () => {
    const ledger = new AutomationStudioSiteResetLedger({ owner: "brief-1" });
    ledger.observed({ ...shelf([]), resource: "r:library-tab-2" });
    expect(ledger.destinationReceipts()).toEqual([{ ref: "destination-1", ordinal: 1, count: 0, page: true }]);
    ledger.explored(add("destination-1"));
    expect(ledger.exploredActs()).toMatchObject([{ id: "act-1", destinations: [], witnessed: false }]);
  });
});
