// @fluxiq-test-group real-sql
// A pinned FluxNode (fluxnode-plan N8; `../pin/`), on the lending library with a scripted model (`./library-lane.ts`):
// a pinned run whose replay breaks still works on to its result (the attempt calls a fix made by hand after a broken
// run an exploration, a repair only when a forward run reaches the last step), and the change is held as a proposal under
// `fluxnode.pinned_change_held` while the pinned Flow stays as it was; a pinned replay runs the pinned version
// though a newer one waits; pinning again adopts the proposal and the next replay runs it; the pin is read back
// after the FluxNode service is made again; and a pin that lands while a run is going holds that run's change too.
import { FLUXNODE_PINNED_CHANGE_HELD, fluxNodeFlowExportSchema, parseFluxNodeRunEvent, parseFluxNodeRunResult, type FluxNodeEventAnswer, type FluxNodeFlowExport, type FluxNodeRunEvent } from "@fluxiq/contracts/fluxnode";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationNodeExecutionResult } from "../../../nodes/index.ts";
import { automationStudioAnswerFirstTaskKey } from "../../answer-first/task-key/index.ts";
import { automationStudioAnswerFirstTaskMemoryOf } from "../../answer-first/task-memory/index.ts";
import { complete, runNode } from "../../answer-first/tests/fake-library.ts";
import { LOANS_OUTPUT } from "../../answer-first/tests/fake-library-engine.ts";
import { fluxNodeCallerKey } from "../caller-key.ts";
import { FluxNodeOwnerFlows } from "../owner-flows.ts";
import { FIND_LOANS, findLoans, findLoansSpec, fluxNodeLane, OWNER, type FluxNodeLane } from "./library-lane.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const NAME = "library.find-loans";
const passing = (event: FluxNodeRunEvent): FluxNodeEventAnswer | undefined => (event.type === "check_needed" ? { type: "check_answer", eventId: event.eventId, pass: true } : undefined);
/** The site changed: "Find loans" now keeps its rows under another label, so a repair's step differs from the saved one. */
const BY_TITLE: JsonObject = { ...LOANS_OUTPUT, label: "Loans by title" };
const findByTitle = (title: string): JsonObject => runNode("find.by-title", FIND_LOANS, { title, recordOutput: BY_TITLE }, [], { add: true });
/** A press of the saved "Find loans" that no longer works on the site. */
const BROKEN: AutomationNodeExecutionResult = { status: "failed", route: "failed", message: "Page says: no search box here", failure: { category: "target_not_found", code: "library.no_search", retryable: false } };
const breaksOldLabel = (parameters: Readonly<Record<string, unknown>>): AutomationNodeExecutionResult | undefined => ((parameters.recordOutput as JsonObject | undefined)?.label === LOANS_OUTPUT.label ? BROKEN : undefined);

async function exported(lane: FluxNodeLane, request: { pin: boolean; proposal?: string }): Promise<FluxNodeFlowExport> {
  const answer = await lane.fluxNodes.exportFlow(OWNER, NAME, request);
  if (!answer.ok) throw new Error(`export refused: ${JSON.stringify(answer.refusal)}`);
  expect(fluxNodeFlowExportSchema.safeParse(answer.value).success).toBe(true);
  return answer.value;
}

/** The steps' digest of the Flow an unpinned run of the FluxNode would replay: the learned Flow. */
async function learnedDigest(lane: FluxNodeLane): Promise<string | undefined> {
  const found = await new FluxNodeOwnerFlows(lane.service, "library", () => 1).find(NAME);
  if (!("found" in found)) throw new Error("the FluxNode is not registered");
  const memory = automationStudioAnswerFirstTaskMemoryOf(lane.service, { paths: lane.service.projectPaths, projects: lane.service.projects });
  const taskId = automationStudioAnswerFirstTaskKey({ instructionText: "", callerKey: fluxNodeCallerKey({ name: NAME, specHash: found.found.specHash }) });
  return (await memory.get(found.found.projectId, taskId))?.best?.stepsDigest;
}

function expectShapes(run: { events: FluxNodeRunEvent[]; result: unknown }): void {
  for (const event of run.events) expect(parseFluxNodeRunEvent(event), JSON.stringify(event)).toMatchObject({ ok: true });
  expect(parseFluxNodeRunResult(run.result)).toMatchObject({ ok: true });
}

describe("a pinned FluxNode replays exactly its pinned Flow, and its changes wait as proposals", () => {
  it("holds a repair as a proposal, replays the pin though it waits, adopts it on the next pin, and keeps the pin across a restart", async () => {
    const lane = await fluxNodeLane(cleanups);
    const learned = await lane.run({ spec: findLoansSpec(), inputs: { title: "Atlas" } }, { script: [findLoans("Atlas"), complete("Found the loans.")], answers: passing });
    expect(learned.result).toMatchObject({ status: "achieved", path: "explored" });
    expect(learned.result.pinned).toBeUndefined();
    const { flowId } = learned.result;

    const pinned = await exported(lane, { pin: true });
    expect(pinned).toMatchObject({ pinned: true, flowVersion: 1, flowId });
    expect(pinned.proposals).toBeUndefined();
    const pinnedDigest = pinned.stepsDigest!;
    expect((pinned.flow.saved as { stepsDigest?: string }).stepsDigest).toBe(pinnedDigest);

    // The site changes: the pinned replay breaks, the run repairs to its result, and the repair is held.
    lane.engine.over = breaksOldLabel;
    const repaired = await lane.run({ name: NAME, inputs: { title: "Birds" } }, { script: [findByTitle("Birds"), complete("Found the loans.")], answers: passing });
    expectShapes(repaired);
    expect(repaired.result).toMatchObject({ status: "achieved", flowId, verdict: { label: "confirmed", by: "check" } });
    expect(repaired.result.path).toBe("repaired");
    expect(repaired.result.outputs).toEqual({ loans: [{ title: "Birds of the Coast", due: "2030-01-02" }] });
    expect(lane.engineLabels).toContain(LOANS_OUTPUT.label);
    const held = repaired.result.pinned?.held;
    expect(repaired.result.pinned).toMatchObject({ flowVersion: 1, stepsDigest: pinnedDigest, held: { code: FLUXNODE_PINNED_CHANGE_HELD, proposal: { runId: repaired.result.runId, path: repaired.result.path } } });
    expect(held?.proposal.stepsDigest).not.toBe(pinnedDigest);
    expect(held?.proposal.flowId).not.toBe(flowId);
    expect(held?.message).toContain(held?.proposal.proposalId);
    expect(repaired.events.find((event) => event.type === "step" && event.stepId === FLUXNODE_PINNED_CHANGE_HELD)).toMatchObject({ state: "skipped", flowId: held?.proposal.flowId });

    // The pinned Flow is as it was: the learned Flow and the export still say the pinned version, with the proposal beside it.
    expect(await learnedDigest(lane)).toBe(pinnedDigest);
    const review = await exported(lane, { pin: false });
    expect(review).toMatchObject({ pinned: true, flowVersion: 1, stepsDigest: pinnedDigest, proposals: [held?.proposal] });
    expect((review.flow.proposals as Record<string, { stepsDigest?: string }>)[held!.proposal.proposalId]?.stepsDigest).toBe(held?.proposal.stepsDigest);

    // A pinned replay runs the pinned version, though a newer one waits: no model call, the old label pressed.
    lane.engine.over = undefined;
    const labelsBefore = lane.engineLabels.length;
    const replayed = await lane.run({ name: NAME, inputs: { title: "Clock" } }, { answers: passing });
    expect(replayed.asked).toHaveLength(0);
    expect(replayed.result).toMatchObject({ status: "achieved", path: "replayed", pinned: { flowVersion: 1, stepsDigest: pinnedDigest } });
    expect(replayed.result.pinned?.held).toBeUndefined();
    expect(replayed.result.outputs).toEqual({ loans: [{ title: "Clockmaking", due: "2030-01-03" }] });
    expect(lane.engineLabels.slice(labelsBefore)).toEqual([LOANS_OUTPUT.label]);

    // Only a pin adopts a proposal, and only one that waits.
    expect(await lane.fluxNodes.exportFlow(OWNER, NAME, { pin: true, proposal: "proposal.nothing" })).toMatchObject({ ok: false, refusal: { code: "invalid_request", issues: [{ path: "/proposal", code: "export_flow.unknown_proposal" }] } });
    expect(await lane.fluxNodes.exportFlow(OWNER, NAME, { pin: false, proposal: held!.proposal.proposalId })).toMatchObject({ ok: false, refusal: { code: "invalid_request", issues: [{ code: "export_flow.proposal_without_pin" }] } });

    const adopted = await exported(lane, { pin: true, proposal: held!.proposal.proposalId });
    expect(adopted).toMatchObject({ pinned: true, flowVersion: 2, stepsDigest: held?.proposal.stepsDigest });
    expect(adopted.proposals).toBeUndefined();
    expect(await learnedDigest(lane)).toBe(held?.proposal.stepsDigest);

    // The FluxNode service made again (nothing in memory): the pin is read back from the Flow, and a replay runs the adopted
    // version. The attempt's fix replaces the step that broke (t885: a hand fix is a repair), so that version presses only the fix.
    lane.restart();
    expect(await exported(lane, { pin: false })).toMatchObject({ pinned: true, flowVersion: 2, stepsDigest: held?.proposal.stepsDigest });
    const fromAdopted = lane.engineLabels.length;
    const after = await lane.run({ name: NAME, inputs: { title: "Atlas" } }, { answers: passing });
    expect(after.asked).toHaveLength(0);
    expect(after.result).toMatchObject({ status: "achieved", path: "replayed", pinned: { flowVersion: 2, stepsDigest: held?.proposal.stepsDigest } });
    expect(after.result.outputs).toEqual({ loans: [{ title: "Atlas of Rivers", due: "2030-01-01" }] });
    expect(lane.engineLabels.slice(fromAdopted)).toEqual([BY_TITLE.label]);
  });

  it("holds the change of a run that was going when the pin landed, and sets the learned Flow back to the pin", async () => {
    const lane = await fluxNodeLane(cleanups);
    const learned = await lane.run({ spec: findLoansSpec(), inputs: { title: "Atlas" } }, { script: [findLoans("Atlas"), complete("Found the loans.")], answers: passing });
    let pressed: () => void = () => undefined;
    const enginePressed = new Promise<void>((resolve) => { pressed = resolve; });
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => { release = resolve; });
    lane.engine.over = async (parameters) => {
      pressed();
      await released;
      return breaksOldLabel(parameters);
    };
    let pinnedDigest = "";
    const going = await lane.run({ name: NAME, inputs: { title: "Birds" } }, {
      script: [findByTitle("Birds"), complete("Found the loans.")], answers: passing,
      onStarted: async () => {
        await enginePressed;
        pinnedDigest = (await exported(lane, { pin: true })).stepsDigest!;
        release();
      }
    });
    expect(going.result.path).not.toBe("replayed");
    expect(going.result).toMatchObject({ status: "achieved", pinned: { flowVersion: 1, stepsDigest: pinnedDigest, held: { code: FLUXNODE_PINNED_CHANGE_HELD, proposal: { flowId: learned.result.flowId, runId: going.result.runId } } } });
    const review = await exported(lane, { pin: false });
    expect(review).toMatchObject({ pinned: true, flowVersion: 1, stepsDigest: pinnedDigest, proposals: [going.result.pinned?.held?.proposal] });
    expect(await learnedDigest(lane)).toBe(pinnedDigest);
  });
});
