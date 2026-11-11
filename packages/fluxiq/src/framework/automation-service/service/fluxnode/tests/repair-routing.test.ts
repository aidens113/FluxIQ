// @fluxiq-test-group real-sql
// A FluxNode run's repair of a broken saved Flow calls `overrides.models.repair` (W3, t899), on the lending library
// (`./library-lane.ts`) behind several priced models (`./priced-models.ts`): the decision calls of the round that
// repairs the Flow are served and priced by the repair model; a fresh exploration is the explore model's; and a run
// with no models is one model, whatever the Flow does.
import type { FluxNodeEventAnswer, FluxNodeRunEvent } from "@fluxiq/contracts/fluxnode";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationNodeExecutionResult } from "../../../nodes/index.ts";
import { complete, runNode } from "../../answer-first/tests/fake-library.ts";
import { LOANS_OUTPUT } from "../../answer-first/tests/fake-library-engine.ts";
import { FIND_LOANS, findLoans, findLoansSpec, fluxNodeLane } from "./library-lane.ts";
import { LANE_DEFAULT_MODEL } from "./priced-models.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const PRICES = { [LANE_DEFAULT_MODEL]: 0.000_002, explorer: 0.000_01, repairer: 0.000_03 };
const NAME = "library.find-loans";
const passing = (event: FluxNodeRunEvent): FluxNodeEventAnswer | undefined => (event.type === "check_needed" ? { type: "check_answer", eventId: event.eventId, pass: true } : undefined);
/** The site changed: "Find loans" now keeps its rows under another label, so the repair's step differs from the saved one. */
const BY_TITLE: JsonObject = { ...LOANS_OUTPUT, label: "Loans by title" };
const findByTitle = (title: string): JsonObject => runNode("find.by-title", FIND_LOANS, { title, recordOutput: BY_TITLE }, [], { add: true });
const BROKEN: AutomationNodeExecutionResult = { status: "failed", route: "failed", message: "Page says: no search box here", failure: { category: "target_not_found", code: "library.no_search", retryable: false } };
const breaksOldLabel = (parameters: Readonly<Record<string, unknown>>): AutomationNodeExecutionResult | undefined => ((parameters.recordOutput as JsonObject | undefined)?.label === LOANS_OUTPUT.label ? BROKEN : undefined);
const decisionsBy = (served: readonly { model: string; taskKind: string }[]) => served.filter((call) => call.taskKind === "evidence_tool_decision").map((call) => call.model);

describe("a FluxNode run's repair of a broken saved Flow", () => {
  it("calls the repair model for the repairing round, priced at it, and the explore model for a fresh exploration", async () => {
    const lane = await fluxNodeLane(cleanups, { models: PRICES });
    const models = { explore: "explorer", repair: "repairer" };
    const learned = await lane.run({ spec: findLoansSpec(), inputs: { title: "Atlas" }, overrides: { models } }, { script: [findLoans("Atlas"), complete("Found the loans.")], answers: passing });
    expect(learned.result).toMatchObject({ status: "achieved", path: "explored" });
    // The first run explores fresh: every decision call is the explore model's, and the repair model served none.
    expect(new Set(decisionsBy(lane.served))).toEqual(new Set(["explorer"]));
    expect(lane.priced).not.toContain("repairer");

    const before = lane.served.length;
    lane.engine.over = breaksOldLabel;
    const repaired = await lane.run({ name: NAME, inputs: { title: "Birds" }, overrides: { models } }, { script: [findByTitle("Birds"), complete("Found the loans.")], answers: passing });
    expect(repaired.result).toMatchObject({ status: "achieved", path: "repaired" });
    const served = lane.served.slice(before);
    expect(repaired.decisions.length).toBeGreaterThan(0);
    expect(decisionsBy(served)).toEqual(repaired.decisions.map(() => "repairer"));
    expect(lane.priced).toContain("repairer");
    const charged = served.reduce((sum, call) => sum + call.costUsd, 0);
    expect(repaired.result.cost.usd).toBeCloseTo(charged, 9);
    expect(served.every((call) => call.costUsd === 15 * PRICES.repairer || call.taskKind !== "evidence_tool_decision")).toBe(true);
  });

  it("is one model for a repair too, where the run names no models", async () => {
    const lane = await fluxNodeLane(cleanups, { models: PRICES });
    await lane.run({ spec: findLoansSpec(), inputs: { title: "Atlas" } }, { script: [findLoans("Atlas"), complete("Found the loans.")], answers: passing });
    lane.engine.over = breaksOldLabel;
    const before = lane.served.length;
    const repaired = await lane.run({ name: NAME, inputs: { title: "Birds" } }, { script: [findByTitle("Birds"), complete("Found the loans.")], answers: passing });
    expect(repaired.result).toMatchObject({ status: "achieved", path: "repaired" });
    expect(new Set(lane.served.slice(before).map((call) => call.model))).toEqual(new Set([LANE_DEFAULT_MODEL]));
  });
});
