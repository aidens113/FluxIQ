// A library's trial, judged by its change (t775): part p1 places 1 hold on a
// book, and the holds list went from 3 rows to 4; part p2 sets the
// reading-room alert to email, a control that already showed it before the
// trial. Of no kind of site the Lab measures.
import type { AutomationStudioTrialSiteChange } from "../../../flow-bootstrap/trial-change/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";

/** The trial's `siteChange`, with p2's proof as given. */
export function libraryHoldsChange(alert: "already_in_end_state" | "carried" | "shown" = "carried", holds: { added: number; changed?: number } = { added: 1 }): AutomationStudioTrialSiteChange {
  return {
    witnesses: [
      {
        id: "w1", kind: "list", where: "My holds", steps: [3], parts: ["p1"],
        before: { source: "latest_read", rows: 3 }, after: { source: "core_look", rows: 3 + holds.added },
        change: { added: holds.added, removed: 0, changed: holds.changed ?? 0, unchanged: 3, lines: { gone: [], added: ["The Quiet Shore — on hold"] } }
      },
      {
        id: "w2", kind: "control", where: "Reading-room alert", steps: [5], parts: ["p2"],
        before: { source: "latest_read", state: { "state 1": 1 } }, after: { source: "end_view", state: { "state 1": 1 } }, change: "none"
      }
    ],
    acts: [
      { step: 3, outcome: "changed", witness: "w1", parts: ["p1"] },
      { step: 5, outcome: "already_in_state", witness: "w2", parts: ["p2"] }
    ],
    leftFromEarlier: [],
    proofs: [
      { part: "p1", effect: { kind: "change", direction: "adds", count: 1, what: "hold on a book" }, proof: "shown", steps: [3] },
      { part: "p2", effect: { kind: "end_state", state: "reading-room alert set to email" }, proof: alert, steps: [5] }
    ]
  };
}

/** A trial's judged summary carrying `siteChange`: no record set, as a trial of acts stores none. */
export function libraryHoldsSummary(siteChange: AutomationStudioTrialSiteChange = libraryHoldsChange()): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: 0,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: 0,
    recordSets: [],
    flowShape: [{ nodeId: "n1", definitionId: "navigate" }, { nodeId: "n3", definitionId: "press" }, { nodeId: "n5", definitionId: "press" }],
    withheld: false,
    siteChange
  };
}

/** The request the library trial was built for. */
export const LIBRARY_HOLDS_REQUEST = "Place a hold on The Quiet Shore and set the reading-room alert to email.";
