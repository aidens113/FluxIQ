// A partial trial over a read Core flagged (t692, `../run.ts`, `../port.ts`):
// the flagged read rides beside the result, Core-only, and the port answers
// the builder's gate's row check with whether the judge's yes was confirmed by
// its converse question (t691), for this build's own trials only. The trial's
// summary is Core's, with one read flagged as a returns desk's last read would
// be (`../../../result-verification/read-account/kept-every-row.ts`).
import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioResultKeptEveryRow } from "../../../result-verification/index.ts";
import { automationStudioSubflowTrialPort, runAutomationStudioSubflowTrial } from "../index.ts";
import { SPENT, subflowTrialFixture as fixture } from "./fixtures.ts";

const FLAG: AutomationStudioResultKeptEveryRow = { narrowerRead: "s3", narrowerSeen: 7, narrowerKept: 3, actedBy: ["s5"], sameList: "items_edge_and_read_target", said: "Step s7 read the same list as step s3." };
let flagged = true;

// The trial's summary as Core makes it, with the returns desk's last read beside its own reads.
vi.mock("../../candidate-trial/index.ts", async (original) => {
  const actual = await original<typeof import("../../candidate-trial/index.ts")>();
  return {
    ...actual,
    automationStudioCandidateTrialSummary: async (...args: Parameters<typeof actual.automationStudioCandidateTrialSummary>) => {
      const summary = await actual.automationStudioCandidateTrialSummary(...args);
      return flagged ? { ...summary, reads: [...(summary.reads ?? []), { nodeId: "s7", definitionId: "unit.list", pagesRead: 1, truncated: false, itemsSeen: 7, kept: 7, keptEveryRow: FLAG }] } : summary;
    }
  };
});

const scopeOf = (f: ReturnType<typeof fixture>, buildId = "build.1") => ({ ...f.request().scope, buildId });

describe("a partial trial over a read Core flagged", () => {
  it("carries the flagged read beside its result, and its row check says the converse confirmed the yes", async () => {
    flagged = true;
    const f = fixture();
    f.setVerdict({ verdict: "yes", spent: { ...SPENT }, firstAskConfirmed: true });
    const trial = await runAutomationStudioSubflowTrial(f.request(), f.ports);
    expect(trial.result).toMatchObject({ verdict: "yes", keptEveryRow: [{ nodeId: "s7", kept: 7, keptEveryRow: FLAG }] });
    expect(trial.rowCheck).toEqual({ converse: "confirmed" });
    expect(JSON.stringify(trial.result.feedback)).toContain("keptEveryRow");
  });

  it("answers the gate's row check from each trial's own converse, and nothing for another build or an unknown trial", async () => {
    flagged = true;
    const f = fixture();
    const { port } = automationStudioSubflowTrialPort("build.1", f.ports);
    const ask = (trialRunId: string | undefined, buildId = "build.1") => port.checkRows!({ scope: scopeOf(f, buildId), revision: 3, digest: "add.3", trialRunId, reads: [], signal: new AbortController().signal });
    f.setVerdict({ verdict: "yes", spent: { ...SPENT }, firstAskConfirmed: true });
    const confirmed = await port(f.request());
    f.setVerdict({ verdict: "yes", spent: { ...SPENT }, firstAskConfirmed: false });
    const unconfirmed = await port(f.request());
    expect(await ask(confirmed.trialRunId)).toEqual({ converse: "confirmed" });
    expect(await ask(unconfirmed.trialRunId)).toEqual({ converse: "unconfirmed" });
    expect(await ask(confirmed.trialRunId, "build.2")).toBeUndefined();
    expect(await ask("subflow-trial.99")).toBeUndefined();
    expect(await ask(undefined)).toBeUndefined();
  });

  it("carries no flagged read where the summary flags none", async () => {
    flagged = false;
    const f = fixture();
    const trial = await runAutomationStudioSubflowTrial(f.request(), f.ports);
    expect(trial.result).not.toHaveProperty("keptEveryRow");
    expect(trial.rowCheck).toEqual({ converse: "unconfirmed" });
  });
});
