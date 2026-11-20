// t963 J1: the one trail builder, screened member by member, from each of its three sources, and on each judge's summary:
// a finished run's (`../../result-summary.ts`, read by `../../verify.ts`), a build test's (`../../build-test/summary.ts`)
// and the shorter forms a run's request takes only when it does not fit (`../fitting.ts`). The fixture is a library's
// catalogue, a kind of site no realistic scenario uses.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { summarizeAutomationStudioRunResult } from "../../result-summary.ts";
import { automationStudioBuildTestResultSummary } from "../../build-test/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioResultRunTrail } from "../trail.ts";
import { automationStudioResultTrailOfAttempts } from "../of/index.ts";
import { automationStudioResultTrailFitting } from "../fitting.ts";

const PAGE = "PAGE \"Catalogue\"\n- 1/2\nt1 \"Moby-Dick\" \"On shelf\"\n- 2/2\nt2 \"Emma\" \"On loan\"";
/** A page long enough that its account is shorter than it. */
const LONG = `${PAGE}\n${"t3 \"Persuasion\" \"On shelf\"\n".repeat(10)}`;

describe("the trail's screen", () => {
  it("withholds a denied member and a credential, keeps the rest whole, and leaves out times and minted ids", () => {
    const { trail, withheld } = automationStudioResultRunTrail([{
      did: "catalogue.read",
      asked: { query: "whale", sessionToken: "abc" },
      found: { page: PAGE, note: "sk-live-0123456789abcdefABCDEF0123456789", startedAt: 1795126386300, waitedMs: 24, commandId: "85c83ac4-626e-4c04-896e-ccef76416716", count: 2 }
    }], ["sessionToken"]);
    expect(withheld).toBe(true);
    const step = trail!.entries[0]!;
    expect(step.asked).toEqual({ query: "whale", sessionToken: "[withheld]" });
    expect(step.found).toEqual({ page: PAGE, note: "[withheld]", count: 2 });
  });

  it("carries nothing without a declaration of denied keys, and nothing for no steps", () => {
    expect(automationStudioResultRunTrail([{ did: "catalogue.read" }], undefined)).toEqual({ withheld: true });
    expect(automationStudioResultRunTrail([], [])).toEqual({ withheld: false });
  });
});

describe("a finished run's trail", () => {
  const attempts = [
    { nodeId: "n1", status: "succeeded", stateRefs: { stateDiff: { added: "t9 \"Sorted by title\"" }, afterAction: { summary: { page: PAGE, internal: 1 } } } },
    { nodeId: "n2", status: "succeeded", outputs: { records: [{ title: "Moby-Dick" }] }, stateRefs: { afterAction: { summary: { page: PAGE } } } }
  ];
  const nodes = [{ id: "n1", definitionId: "catalogue.sort", label: "Sort by title" }, { id: "n2", definitionId: "catalogue.read", label: "Read the shelf" }];

  it("is each traced step in run order, with what it answered, changed and the page after it, by the view keys", () => {
    const steps = automationStudioResultTrailOfAttempts(attempts, nodes, ["page"]);
    expect(steps).toEqual([
      { did: "catalogue.sort", on: "Sort by title", outcome: "succeeded", found: { changed: { added: "t9 \"Sorted by title\"" }, view: { page: PAGE } } },
      { did: "catalogue.read", on: "Read the shelf", outcome: "succeeded", found: { outputs: { records: [{ title: "Moby-Dick" }] }, view: { page: PAGE } } }
    ]);
  });

  it("is on the summary the run's check judges, beside the final data", () => {
    // With no Flow nodes given, each step is said by its node id.
    const summary = summarizeAutomationStudioRunResult({ recordSets: [], sessionAttempts: attempts, observedStateKeys: ["page"], deniedEvidenceKeys: [] });
    expect(summary.trail?.entries.map((step) => step.did)).toEqual(["n1", "n2"]);
    expect(summary.trail?.entries[0]?.found).toEqual({ changed: { added: "t9 \"Sorted by title\"" }, view: { page: PAGE } });
    expect(summary.trail?.note).toContain("Answer no only on a concrete contradiction");
  });
});

describe("a build test's trail", () => {
  it("is each observation in order, its evidence whole with the page it showed", () => {
    const summary = automationStudioBuildTestResultSummary({
      steps: [],
      nodes: [],
      deniedEvidenceKeys: [],
      report: { verdict: { outcomes: [] }, reused: false, observations: [{ step: 1, resultCode: "replayed", evidence: { location: "https://library.example/catalogue?sort=title", page: PAGE } }, { step: 2, pass: 1, of: 2, evidence: { ended: "no further page" } }] }
    });
    expect(summary.trail?.entries).toEqual([
      { n: 1, did: "step 1: step", outcome: "replayed", where: "https://library.example/catalogue?sort=title", found: { page: PAGE } },
      { n: 2, did: "step 2: step (pass 1 of 2)", found: { ended: "no further page" } }
    ]);
  });
});

describe("a run's request that does not fit", () => {
  it("summarises the views first, then each step's findings oldest first, and never the rows or the outcomes", () => {
    const summary = {
      schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 1, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1,
      recordSets: [{ datasetId: "d", recordCount: 1, refusedCount: 0, truncated: false, columns: ["title"], columnsWithheld: false, rowsChecked: 0, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: [{ title: "Moby-Dick" }] }],
      flowShape: [], withheld: false,
      startView: { view: { page: LONG } }, endView: { view: { page: LONG } },
      trail: { note: "n", entries: [{ n: 1, did: "a", outcome: "ok", asked: { query: "whale ".repeat(20) }, found: { page: LONG } }, { n: 2, did: "b", outcome: "ok", found: { page: LONG } }] }
    } as unknown as AutomationStudioRunResultSummary;
    const forms = automationStudioResultTrailFitting(summary);
    const items = (forms.at(-1) as unknown as { summarised: { items: string[] } }).summarised.items;
    expect(items).toEqual(["startView.view", "endView.view", "trail.entries[0].found", "trail.entries[1].found", "trail.entries[0].asked"]);
    const last = forms.at(-1) as unknown as JsonObject & { recordSets: unknown; trail: { entries: { outcome: string }[] } };
    expect(last.recordSets).toEqual(summary.recordSets);
    expect(last.trail.entries.map((step) => step.outcome)).toEqual(["ok", "ok"]);
  });
});
