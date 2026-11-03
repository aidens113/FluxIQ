import { describe, expect, it } from "vitest";
import {
  exportAutomationStudioTrialEvidenceResult,
  ingestAutomationStudioTrialEvidenceResult,
  isAutomationStudioTrialEvidenceLiveSuccess,
  tallyAutomationStudioLiveEpisodes
} from "../index.ts";
import { livePass, recordedPass } from "./trial-evidence-builders.ts";

describe("derived provenance", () => {
  it("T24: an exported offline result keeps its origins and comes back derived", () => {
    const exported = exportAutomationStudioTrialEvidenceResult(recordedPass());
    expect(exported.kind).toBe("fluxiq.trial-evidence-result");
    expect(exported.result.provenance).toBe("derived");
    const back = ingestAutomationStudioTrialEvidenceResult(JSON.parse(JSON.stringify(exported)));
    expect(back.ok).toBe(true);
    expect(back.ok && back.result.evidenceOrigins).toEqual(["recorded", "pure_computation"]);
    expect(back.ok && back.result.provenance).toBe("derived");
  });

  it("T24: an exported offline result edited to claim a live whole run cannot create a live success", () => {
    const exported = exportAutomationStudioTrialEvidenceResult(recordedPass());
    const relabelled = { ...exported, result: { ...exported.result, evidenceOrigins: ["live"], scope: "full_live_run", sourceEpisodeIds: [], liveEpisodeId: "run-forged", provenance: "original" } };
    const back = ingestAutomationStudioTrialEvidenceResult(relabelled);
    expect(back.ok).toBe(true);
    expect(back.ok && back.result.provenance).toBe("derived");
    expect(back.ok && isAutomationStudioTrialEvidenceLiveSuccess(back.result)).toBe(false);
    expect(back.ok && tallyAutomationStudioLiveEpisodes([back.result])).toEqual({ liveEpisodes: 0, liveSuccesses: 0 });
  });

  it("a re-ingested copy of a real live pass does not add a second success", () => {
    const original = livePass("run-a");
    const back = ingestAutomationStudioTrialEvidenceResult(exportAutomationStudioTrialEvidenceResult(original));
    expect(back.ok).toBe(true);
    if (back.ok) expect(tallyAutomationStudioLiveEpisodes([original, back.result])).toEqual({ liveEpisodes: 1, liveSuccesses: 1 });
  });

  it("does not alias the exported result", () => {
    const original = recordedPass();
    const exported = exportAutomationStudioTrialEvidenceResult(original);
    exported.result.evidenceOrigins.push("live");
    expect(original.evidenceOrigins).toEqual(["recorded", "pure_computation"]);
    expect(original.provenance).toBe("original");
  });

  it("refuses an export of a result that does not validate", () => {
    expect(() => exportAutomationStudioTrialEvidenceResult(recordedPass({ evidenceOrigins: [] }))).toThrow(/trial evidence result is invalid/u);
  });

  it("refuses an envelope of another kind, or a bare result", () => {
    expect(ingestAutomationStudioTrialEvidenceResult({ kind: "other", result: recordedPass() }).ok).toBe(false);
    expect(ingestAutomationStudioTrialEvidenceResult(recordedPass()).ok).toBe(false);
    expect(ingestAutomationStudioTrialEvidenceResult(null).ok).toBe(false);
  });

  it("refuses an ingested result that does not validate", () => {
    const exported = exportAutomationStudioTrialEvidenceResult(recordedPass());
    const broken = { ...exported, result: { ...exported.result, reasonCodes: ["invented"] } };
    const back = ingestAutomationStudioTrialEvidenceResult(broken);
    expect(back.ok).toBe(false);
    expect(!back.ok && back.issues.map((issue) => issue.code)).toContain("trial_evidence.reason_unknown");
  });
});
