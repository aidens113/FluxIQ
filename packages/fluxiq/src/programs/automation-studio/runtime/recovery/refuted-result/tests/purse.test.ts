// The repair's purse, opened with what the Flow already spent (t438). The
// user's words (2026-10-01): "bring the ceiling down to $0.1 per flow max".
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowRunDetail } from "../../../../model/index.ts";
import { automationStudioLlmRunCostCeilingUsd } from "../../../llm/index.ts";
import {
  AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY,
  automationStudioResultRepairPurse,
  automationStudioResultRepairPurseAllowsPart,
  automationStudioResultRepairPurseAveraged,
  automationStudioResultRepairPurseCharged,
  automationStudioResultRepairPurseLeftUsd,
  automationStudioResultRepairWithPurse
} from "../index.ts";

const CEILING = automationStudioLlmRunCostCeilingUsd();
const usd = (value: number): number => Math.round(value * 1_000_000_000) / 1_000_000_000;
const run = (metadata: AutomationStudioFlowRunDetail["metadata"] = {}): AutomationStudioFlowRunDetail => ({
  schemaVersion: "0.1",
  summary: { schemaVersion: "0.1", runId: "run.one", flowId: "flow.one", projectId: "project.one", status: "failed", updatedAt: 1, routeDecisionCount: 0, subflowEntryCount: 0, actionAttemptCount: 0, interventionCount: 0, adaptationCount: 0 },
  routeDecisions: [], subflows: [], actionAttempts: [], interventions: [], adaptationIds: [], changeProposalIds: [], metadata
});

describe("the repair's purse, carrying the Flow's spend", () => {
  it("opens a new purse with what the Flow already spent, so only the rest of its ceiling is left", () => {
    const purse = automationStudioResultRepairPurse(run(), undefined, usd(CEILING * 0.425));
    expect(purse).toMatchObject({ limitUsd: CEILING, carriedUsd: usd(CEILING * 0.425), spentUsd: usd(CEILING * 0.425) });
    expect(automationStudioResultRepairPurseLeftUsd(purse)).toBe(usd(CEILING * 0.575));
  });

  it("carries nothing when nothing is handed, as outside the Lab", () => {
    expect(automationStudioResultRepairPurse(run())).toMatchObject({ carriedUsd: 0, spentUsd: 0 });
    expect(automationStudioResultRepairPurse(run(), undefined, Number.NaN)).toMatchObject({ carriedUsd: 0, spentUsd: 0 });
  });

  it("allows no part once the Flow spent its ceiling", () => {
    expect(automationStudioResultRepairPurseAllowsPart(automationStudioResultRepairPurse(run(), undefined, CEILING))).toBe(false);
  });

  it("keeps an unreported part unknown and refuses further parts on later passes", () => {
    const unknown = automationStudioResultRepairPurseCharged(automationStudioResultRepairPurse(run()), { reachedProvider: true });
    expect(unknown.unreportedParts).toBe(1);
    expect(automationStudioResultRepairPurseAllowsPart(unknown)).toBe(false);
    const recorded = automationStudioResultRepairWithPurse(run(), unknown);
    expect(automationStudioResultRepairPurseAllowsPart(automationStudioResultRepairPurse(recorded))).toBe(false);
    expect(recorded.metadata?.[AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY]).toMatchObject({ purse: { unreportedParts: 1 } });
  });

  it("records what it carried, and opens every later pass from what the Flow has spent, not from the run's own figure", () => {
    const opened = automationStudioResultRepairPurseCharged(automationStudioResultRepairPurse(run(), undefined, usd(CEILING * 0.4)), { costUsd: usd(CEILING * 0.2), calls: 4, reachedProvider: true });
    const recorded = automationStudioResultRepairWithPurse(run(), opened);
    expect(recorded.metadata?.[AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY]).toMatchObject({ purse: { carriedUsd: usd(CEILING * 0.4), spentUsd: usd(CEILING * 0.6), leftUsd: usd(CEILING * 0.4) } });
    // The Flow's record now holds this pass's spend, and a check since: the next pass opens from it and keeps the run's averages.
    const again = automationStudioResultRepairPurse(recorded, undefined, usd(CEILING * 0.65));
    expect(again).toMatchObject({ carriedUsd: usd(CEILING * 0.65), spentUsd: usd(CEILING * 0.65), averagedCalls: 4, averagedUsd: usd(CEILING * 0.2) });
    // Outside the Lab the run's own figure is what a later pass opens from.
    expect(automationStudioResultRepairPurse(recorded)).toMatchObject({ carriedUsd: 0, spentUsd: usd(CEILING * 0.6) });
  });

  it("counts a part the Flow's record already holds in the averages only, never charging it again", () => {
    const counted = automationStudioResultRepairPurseAveraged(automationStudioResultRepairPurse(run(), undefined, usd(CEILING * 0.5)), { costUsd: usd(CEILING * 0.04), calls: 2 });
    expect(counted).toMatchObject({ spentUsd: usd(CEILING * 0.5), averagedCalls: 2, averagedUsd: usd(CEILING * 0.04) });
  });
});
