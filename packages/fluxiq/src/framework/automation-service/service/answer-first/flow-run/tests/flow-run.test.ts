// @fluxiq-test-group real-sql
// The Flow run stage on the real engine, a real service and a real dataset store: what it runs,
// what it says each step did, and that a run that fails is an answer. No model, no browser.
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioAskEffect } from "../../../../../../runtime/automation-parking/index.ts";
import { automationStudioFlowBootstrapSizeLimits } from "../../../../../../runtime/flow-authoring/bootstrap/plan/index.ts";
import { automationStudioAnswerFirstFlowRun, automationStudioAnswerFirstSourceAuthority } from "../index.ts";
import { AutomationStudioCandidateSource, AutomationStudioFlowCandidateDraftStore } from "../../../candidate-drafts/index.ts";
import { candidateSourceFixture } from "../../../candidate-drafts/tests/fixtures.ts";
import { AutomationStudioProjectPaths, AutomationStudioFlowPaths } from "../../../paths/index.ts";
import type { AutomationStudioProjectStore } from "../../../projects/index.ts";
import { automationStudioAnswerFirstSaveDraft } from "../../attempt/index.ts";
import { automationStudioAnswerFirstResultFeed } from "../../result-feed/index.ts";
import { flowRunFixture, libraryTarget, LOANS_OUTPUT, OPEN_ACCOUNT, pressLoan, renewEveryLoan, savedStep, shownRows, type FlowRunFixture } from "../../tests/fake-library-engine.ts";
import { READ_LOANS, RENEW_CARD, RENEW_LOAN } from "../../tests/fake-library.ts";

vi.setConfig({ testTimeout: 60_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const ran = (fixture: FlowRunFixture, steps = renewEveryLoan()) => automationStudioAnswerFirstFlowRun(fixture.ports, { steps, stepsDigest: "digest.saved" });

/** The real save path and strict disk owner, with no mocked compiler or source-verification result. */
async function savedSource(fixture: FlowRunFixture, summary: string) {
  const parent = await realpath(os.tmpdir()), root = await mkdtemp(path.join(parent, "fluxiq-flow-run-source-"));
  cleanups.push(async () => {
    const target = await realpath(root);
    expect(path.dirname(target)).toBe(parent);
    expect(path.basename(target)).toMatch(/^fluxiq-flow-run-source-/);
    await rm(target, { recursive: true, force: true });
  });
  const paths = new AutomationStudioProjectPaths(root);
  const drafts = new AutomationStudioFlowCandidateDraftStore(paths, new AutomationStudioFlowPaths(paths), { ensureProjectStructure: async () => undefined } as unknown as AutomationStudioProjectStore);
  const original = await fixture.service.getFlowInstruction(fixture.projectId, "instruction.task");
  if (!original) throw new Error("Missing original fixture instruction");
  const source = AutomationStudioCandidateSource.capture({ projectId: fixture.projectId, flowId: fixture.flowId, inventoryInstructionIds: [original.instructionId], instructions: [original] });
  const binding = await fixture.service.getLlmExecutionBinding(fixture.projectId, fixture.flowId);
  fixture.ports.input.instructionText = AutomationStudioCandidateSource.text(source);
  const steps = renewEveryLoan(), zero = { estimatedInputTokens: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  const attempt = {
    steps, usage: zero, result: automationStudioAnswerFirstResultFeed({ instructionText: fixture.ports.input.instructionText, readRowsKey: undefined }),
    input: { ...fixture.ports.input, source, stores: { drafts }, baseDependencyDigest: binding.executionDigest, baseSettingsRevision: binding.settingsRevision,
      provider: { provider: { metadata: { provider: "test", model: "test" } } }, authority: { usage: zero }, creation: { purse: { spentUsd: () => 0 } } }
  } as unknown as Parameters<typeof automationStudioAnswerFirstSaveDraft>[0];
  const saved = await automationStudioAnswerFirstSaveDraft(attempt, summary);
  if (saved.kind !== "saved" || saved.record.schemaVersion !== 2) throw new Error("The actual fixture draft did not save as v2");
  const authority = automationStudioAnswerFirstSourceAuthority({ projectId: fixture.projectId, flowId: fixture.flowId, owner: fixture.service, drafts });
  return { steps, saved, authority, drafts, reference: candidateSourceFixture.reference(saved.record) };
}

describe("the executable source carried by a run", () => {
  it("carries the exact saved candidate reference without changing the run's digest or work", async () => {
    const fixture = await flowRunFixture({}, cleanups);
    const { steps, saved, authority, reference } = await savedSource(fixture, "The saved steps of this task.");
    const read = vi.spyOn(authority, "read");
    fixture.ports.sourceAuthority = authority;
    const outcome = await automationStudioAnswerFirstFlowRun(fixture.ports, { steps, stepsDigest: "digest.saved", candidateId: saved.record.candidateId, stated: saved.stated });
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: true, executableSource: { status: "bound", reference } });
    expect(read).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenNthCalledWith(1, saved.record.candidateId);
    expect(read).toHaveBeenNthCalledWith(2, saved.record.candidateId, reference);
    expect(fixture.target.library.renewals).toEqual({ "Atlas of Rivers": 1, "Birds of the Coast": 1, Clockmaking: 1 });
    expect(fixture.counts).toEqual({ liveSteps: 4, arrived: true });
  });

  it("reassembles an actual saved completion with its recorded original compiler input", async () => {
    const fixture = await flowRunFixture({}, cleanups);
    const { steps, saved, authority, reference } = await savedSource(fixture, "Renewed every current loan.");
    fixture.ports.sourceAuthority = authority;
    const outcome = await automationStudioAnswerFirstFlowRun(fixture.ports, { steps, stepsDigest: "digest.saved", candidateId: saved.record.candidateId, stated: saved.stated });
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: true, executableSource: { status: "bound", reference } });
    expect(fixture.counts).toEqual({ liveSteps: 4, arrived: true });
  });

  it.each(["revision", "replacement", "original source"] as const)("pins source A before assembly and refuses changed %s B", async kind => {
    let assembling: (() => Promise<void>) | undefined;
    const events: string[] = [];
    const fixture = await flowRunFixture({ binding: { resolvePlanNodeParameters: async ({ parameters }) => {
      const change = assembling;
      assembling = undefined;
      await change?.();
      return { status: "resolved", parameters };
    } } }, cleanups);
    const { steps, saved, authority, drafts } = await savedSource(fixture, "The saved steps of this task.");
    const read = authority.read;
    vi.spyOn(authority, "read").mockImplementation(async (...args) => {
      events.push("source");
      return read(...args);
    });
    assembling = async () => {
      events.push("assembly");
      if (kind === "original source") {
        const original = await fixture.service.getFlowInstruction(fixture.projectId, "instruction.task");
        if (!original) throw new Error("Missing source to change");
        await fixture.service.saveFlowInstruction(fixture.projectId, { ...original, body: "Changed original task", updatedAt: original.updatedAt + 1 });
      } else {
        const newer = structuredClone(saved.record);
        if (kind === "revision") newer.candidate.revision += 1;
        else newer.candidateId = "candidate.replaced";
        await drafts.save(newer);
      }
    };
    fixture.ports.sourceAuthority = authority;
    const outcome = await automationStudioAnswerFirstFlowRun(fixture.ports, { steps, stepsDigest: "digest.saved", candidateId: saved.record.candidateId, stated: saved.stated });
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: true, executableSource: { status: "unknown", code: kind === "original source" ? "binding_changed" : "source_stale" } });
    expect(events.slice(0, 2)).toEqual(["source", "assembly"]);
    if (kind !== "original source") expect(events).toEqual(["source", "assembly", "source"]);
    expect(fixture.counts).toEqual({ liveSteps: 4, arrived: true });
  });

  it("treats an altered recorded summary as an untrusted hint requiring complete plan equality", async () => {
    const fixture = await flowRunFixture({}, cleanups);
    const { steps, saved, authority, drafts } = await savedSource(fixture, "Renewed every current loan.");
    const altered = structuredClone(saved.record);
    altered.candidate.summary = "A different recorded compiler input";
    await drafts.save(altered);
    fixture.ports.sourceAuthority = authority;
    const outcome = await automationStudioAnswerFirstFlowRun(fixture.ports, { steps, stepsDigest: "digest.saved", candidateId: saved.record.candidateId });
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: true, executableSource: { status: "unknown", code: "executable_changed" } });
  });

  it("keeps a candidate replaced during actual execution unknown", async () => {
    const fixture = await flowRunFixture({}, cleanups);
    const { steps, saved, authority, drafts } = await savedSource(fixture, "Renewed every current loan.");
    let changed = false;
    fixture.target.over = ({ nodeId, inputs, parameters }) => {
      if (nodeId !== RENEW_LOAN || changed) return undefined;
      changed = true;
      return drafts.save({ ...saved.record, candidateId: "candidate.replaced" }).then(() => pressLoan(fixture.target, inputs ?? {}, parameters ?? {}));
    };
    fixture.ports.sourceAuthority = authority;
    const outcome = await automationStudioAnswerFirstFlowRun(fixture.ports, { steps, stepsDigest: "digest.saved", candidateId: saved.record.candidateId });
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: true, executableSource: { status: "unknown", code: "source_stale" } });
    expect(changed).toBe(true);
    expect(fixture.target.presses).toHaveLength(3);
  });

  it("keeps an initially unknown source unknown and uses ordinary default assembly", async () => {
    const fixture = await flowRunFixture({}, cleanups);
    const { steps, saved, authority } = await savedSource(fixture, "Renewed every current loan.");
    const read = vi.fn(authority.read).mockResolvedValueOnce({ status: "unknown", code: "source_unbound" });
    fixture.ports.sourceAuthority = { read };
    const outcome = await automationStudioAnswerFirstFlowRun(fixture.ports, { steps, stepsDigest: "digest.saved", candidateId: saved.record.candidateId });
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: true, executableSource: { status: "unknown", code: "source_unbound" } });
    expect(read).toHaveBeenCalledOnce();
    expect(fixture.counts).toEqual({ liveSteps: 4, arrived: true });
  });

  it("runs a legacy caller with a saved id and no authority", async () => {
    const fixture = await flowRunFixture({}, cleanups);
    const outcome = await automationStudioAnswerFirstFlowRun(fixture.ports, { steps: renewEveryLoan(), stepsDigest: "digest.saved", candidateId: "candidate.saved" });
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: true, executableSource: { status: "unknown", code: "authority_missing" } });
    expect(fixture.counts).toEqual({ liveSteps: 4, arrived: true });
  });

  it("keeps authority errors closed and still runs ordinary legacy steps", async () => {
    const fixture = await flowRunFixture({}, cleanups);
    const read = vi.fn(async () => { throw new Error("private source text"); });
    fixture.ports.sourceAuthority = { read };
    const outcome = await automationStudioAnswerFirstFlowRun(fixture.ports, { steps: renewEveryLoan(), stepsDigest: "digest.saved", candidateId: "candidate.saved" });
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: true, executableSource: { status: "unknown", code: "unavailable" } });
    expect(JSON.stringify(outcome)).not.toContain("private source text");
    expect(fixture.counts).toEqual({ liveSteps: 4, arrived: true });
  });
});

describe("a saved Flow's run", () => {
  it("runs the saved steps on the engine with no model, and says what each step did", async () => {
    const fixture = await flowRunFixture({}, cleanups);
    const outcome = await ran(fixture);
    expect(outcome).toEqual({
      kind: "ran", reachedEnd: true,
      steps: [{ position: 1, label: "the list of loans", ran: "passed" }, { position: 2, ran: "passed" }]
    });
    expect(fixture.target.library.renewals).toEqual({ "Atlas of Rivers": 1, "Birds of the Coast": 1, Clockmaking: 1 });
    expect(fixture.counts).toEqual({ liveSteps: 4, arrived: true });
  });

  it("puts the run's rows in the attempt's sink, as the record output kept them", async () => {
    const fixture = await flowRunFixture({}, cleanups);
    await ran(fixture);
    const rows = await fixture.sink.readBack("loans");
    expect(rows).toMatchObject({ fromStore: true, datasetId: "loans", totalRows: 3, columns: [{ id: "title" }, { id: "due" }] });
    expect(rows.rows).toEqual([{ title: "Atlas of Rivers", due: "2030-01-01" }, { title: "Birds of the Coast", due: "2030-01-02" }, { title: "Clockmaking", due: "2030-01-03" }]);
  });

  it("keeps raw look columns separate from the ledger's declared answer and export", async () => {
    const fixture = await flowRunFixture({}, cleanups);
    const result = automationStudioAnswerFirstResultFeed({ instructionText: "Give columns title and due.", readRowsKey: "read.extracted" });
    fixture.ports.result = result;
    await ran(fixture);
    const read = async (callId: string, rows: JsonObject[]) => {
      const call = { callId, toolId: "core.run_node", value: { node: READ_LOANS } };
      const answer = { kind: "llm_evidence_tool_execution" as const, evidence: { read: { extracted: rows } }, effectApplied: false };
      const stored = await fixture.sink.fromCall(call, answer);
      result.expect(undefined);
      result.called(call, answer, stored);
    };
    await read("read.again", shownRows(fixture.target));
    expect(await fixture.sink.readBack("loans")).toMatchObject({ fromStore: true, datasetId: "loans", totalRows: 3 });
    fixture.target.library.loans.push({ title: "Dials", due: "2030-02-01" }, { title: "Ephemera", due: "2030-02-02" });
    await read("read.more", shownRows(fixture.target));
    const rows = await fixture.sink.readBack("read.read.more");
    expect(rows).toMatchObject({ fromStore: true, datasetId: "read.read.more", totalRows: 5 });
    expect(rows.rows.map((row) => row.title)).toEqual(["Atlas of Rivers", "Birds of the Coast", "Clockmaking", "Dials", "Ephemera"]);
    expect(rows.rows.every((row) => Object.keys(row).join() === "title,due,shelfmark")).toBe(true);
    const answer = result.rows();
    expect(answer.totalRows).toBe(3);
    expect(answer.columns.map((column) => column.id)).toEqual(["title", "due"]);
    expect(answer.rows.every((row) => Object.keys(row).join() === "title,due")).toBe(true);
    expect(result.evidence().looks.at(-1)?.rows).toHaveLength(5);
    await fixture.sink.publish(answer, result.evidence());
    if (!answer.datasetId) throw new Error("The declared answer has no dataset");
    const published = await fixture.sink.readBack(answer.datasetId);
    expect(published.rows).toEqual(answer.rows);
    expect(published.columns.map((column) => column.id)).toEqual(["title", "due"]);
    const exported = await fixture.service.runDatasets.exportRunDataset({ projectId: fixture.projectId, runId: fixture.ports.runId, datasetId: answer.datasetId, format: "json" });
    if (!exported || exported.tooLarge) throw new Error("No inline answer export");
    expect(JSON.parse(exported.body)).toEqual(answer.rows);
    expect(exported.body).not.toContain("shelfmark");
    expect(exported.body).not.toContain("$handle");
  });

  it("names a step by its draft position: one left out of the plan is simply absent", async () => {
    const fixture = await flowRunFixture({}, cleanups);
    const steps = [
      savedStep(1, READ_LOANS, { recordOutput: LOANS_OUTPUT }, { disposition: "exploratory" }),
      savedStep(2, RENEW_CARD, {}, { disposition: "dropped", consequences: ["modify_existing"] }),
      savedStep(3, READ_LOANS, { recordOutput: LOANS_OUTPUT }),
      savedStep(4, RENEW_CARD, {}, { consequences: ["modify_existing"], label: "Renew card" })
    ];
    expect(await ran(fixture, steps)).toMatchObject({ kind: "ran", reachedEnd: true, steps: [{ position: 3, ran: "passed" }, { position: 4, label: "Renew card", ran: "passed" }] });
    expect(fixture.target.library.renewals).toEqual({ card: 1 });
  });

  it("says a step not reached, and the failing step in Core's words, with nothing of the page", async () => {
    const target = libraryTarget();
    target.page = "elsewhere";
    const fixture = await flowRunFixture({ target }, cleanups);
    const outcome = await ran(fixture);
    expect(outcome).toEqual({
      kind: "ran", reachedEnd: false,
      steps: [{ position: 1, label: "the list of loans", ran: "failed", happened: "The step's control was not found on the page." }, { position: 2, ran: "not_reached" }],
      failing: { position: 1, label: "the list of loans", happened: "The step's control was not found on the page.", code: "library.list_not_on_page" }
    });
    expect(JSON.stringify(outcome)).not.toContain("Elm Street");
    expect(fixture.target.presses).toEqual([]);
  });

  it("a step the record says is done reads as skipped, and is not pressed", async () => {
    const fixture = await flowRunFixture({}, cleanups);
    fixture.record.settled({ actionId: RENEW_CARD, parameters: {}, consequences: ["modify_existing"], stage: "exploration" }, { effectApplied: true, words: { what: "Renewed the card", where: "On the account" } });
    const outcome = await ran(fixture, [savedStep(1, RENEW_CARD, {}, { consequences: ["modify_existing"] })]);
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: true, steps: [{ position: 1, ran: "skipped", happened: expect.stringContaining("not done again") }] });
    expect(fixture.target.presses).toEqual([]);
    expect(fixture.counts.liveSteps).toBe(0);
  });

  it("does not fetch anything back or put anything back: nothing resets, and a hook is not called", async () => {
    const prepareCandidateStart = vi.fn(async () => ({}));
    const fixture = await flowRunFixture({ over: { prepareCandidateStart } }, cleanups);
    await ran(fixture);
    expect(prepareCandidateStart).not.toHaveBeenCalled();
  });

  it("goes to the start location only by the Flow's own first step, kept by the assembly at its saved position", async () => {
    const target = libraryTarget();
    target.page = "elsewhere";
    const fixture = await flowRunFixture({ target, startLocation: "library://account", binding: { runsNodes: { arrival: { node: OPEN_ACCOUNT, parameter: "url" } } } }, cleanups);
    const steps = [
      savedStep(1, READ_LOANS, { recordOutput: LOANS_OUTPUT }),
      savedStep(2, OPEN_ACCOUNT, { url: "library://account" }, { disposition: "exploratory" })
    ];
    // Withdrawn, the arrival is put back ahead of everything; it is still the saved draft's step 2.
    expect(await ran(fixture, steps)).toMatchObject({ kind: "ran", reachedEnd: true, steps: [{ position: 1, ran: "passed" }, { position: 2, ran: "passed" }] });
    expect(target.reads).toBe(1);
  });

  it("is not assembled, and asks and sends nothing, for steps no Flow can be made of", async () => {
    const fixture = await flowRunFixture({ answer: "allow" }, cleanups);
    const outcome = await ran(fixture, [savedStep(1, "domain.library.no_such_node", {}, { consequences: ["delete"] })]);
    expect(outcome).toMatchObject({ kind: "not_assembled", codes: [expect.stringMatching(/^flow_bootstrap\./u)] });
    expect(fixture.asked).toEqual([]);
    expect(fixture.counts).toEqual({ liveSteps: 0, arrived: false });
  });
});

describe("what a run does not end", () => {
  it("a Flow its own size setting let assemble runs whole: past the default hundred nodes, and past the engine's default step bound", async () => {
    const steps = Array.from({ length: 270 }, (_, index) => savedStep(index + 1, READ_LOANS, { recordOutput: LOANS_OUTPUT }));
    const fixture = await flowRunFixture({ size: automationStudioFlowBootstrapSizeLimits(300) }, cleanups);
    const outcome = await ran(fixture, steps);
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: true });
    if (outcome.kind === "ran") expect(outcome.steps.filter((step) => step.ran === "passed")).toHaveLength(270);
    expect(fixture.target.reads).toBe(270);
    // With no raised setting the same steps never assemble, so nothing is sent and the attempt carries on.
    const small = await flowRunFixture({}, cleanups);
    expect(await ran(small, steps)).toMatchObject({ kind: "not_assembled" });
    expect(small.target.reads).toBe(0);
  });

  it("a step bound the engine really reaches is a failing step, not an ending", async () => {
    const fixture = await flowRunFixture({ engine: (engine) => ({ ...engine, graphOptions: (input) => ({ ...engine.graphOptions(input), maxSteps: 3 }) }) }, cleanups);
    // A straight line: each pass of a repeat raises the engine's bound (`graph-run.ts`, `withIterationAllowance`).
    const steps = [1, 2, 3, 4, 5].map((position) => savedStep(position, READ_LOANS, { recordOutput: LOANS_OUTPUT }));
    const outcome = await ran(fixture, steps);
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: false, failing: { happened: "The run took as many steps as it is allowed and stopped here." } });
    if (outcome.kind !== "ran") return;
    expect(outcome.steps.find((step) => step.position === outcome.failing!.position)?.ran).toBe("failed");
    expect(outcome.steps.at(-1)?.ran).toBe("not_reached");
    expect(fixture.target.reads).toBeGreaterThan(0);
    expect(fixture.target.reads).toBeLessThan(5);
    expect(fixture.counts.arrived).toBe(true);
  });

  it("a deadline the engine really reaches is a failing step, the one the run was on, and what passed before it stays passed", async () => {
    const target = libraryTarget();
    target.over = ({ nodeId, signal }) => nodeId !== RENEW_CARD ? undefined : new Promise(() => { signal?.addEventListener("abort", () => undefined); });
    const fixture = await flowRunFixture({ target, engine: (engine) => ({ ...engine, parentFlow: async () => ({ ...await engine.parentFlow(), executionDefaults: { timeoutMs: 400 } }) }) }, cleanups);
    const outcome = await ran(fixture, [savedStep(1, READ_LOANS, { recordOutput: LOANS_OUTPUT }), savedStep(2, RENEW_CARD, {}, { consequences: ["modify_existing"] }), savedStep(3, READ_LOANS, { recordOutput: LOANS_OUTPUT })]);
    expect(outcome).toEqual({
      kind: "ran", reachedEnd: false,
      steps: [{ position: 1, ran: "passed" }, { position: 2, ran: "failed", happened: "The run reached the time this Flow is allowed and stopped here." }, { position: 3, ran: "not_reached" }],
      failing: { position: 2, happened: "The run reached the time this Flow is allowed and stopped here.", code: "candidate.execution_incomplete" }
    });
    expect(fixture.counts.arrived).toBe(true);
    // The press the deadline overtook is on the record as may have landed: it is looked at first, and never repeated blind.
    expect(fixture.record.acts()).toMatchObject([{ state: "may_have_landed" }]);
  });

  it("a Stop during the run reads as stopped, however the run answered", async () => {
    const target = libraryTarget();
    let fixture: FlowRunFixture | undefined;
    target.over = ({ nodeId }) => {
      if (nodeId === RENEW_LOAN) fixture!.stop.abort();
      return undefined;
    };
    fixture = await flowRunFixture({ target }, cleanups);
    expect(await ran(fixture)).toEqual({ kind: "stopped" });
  });

  it("a thrown cancellation reads as a Stop", async () => {
    const fixture = await flowRunFixture({ engine: (engine) => ({ ...engine, parentFlow: async () => { throw new DOMException("Build stopped.", "AbortError"); } }) }, cleanups);
    expect(await ran(fixture)).toEqual({ kind: "stopped" });
  });

  it("a real defect reads as a run that could not start, at its first step, in plain words and with none of the error's", async () => {
    const fixture = await flowRunFixture({ engine: () => { throw new Error("secret words from Elm Street 4"); } }, cleanups);
    const outcome = await ran(fixture);
    expect(outcome).toEqual({
      kind: "ran", reachedEnd: false,
      steps: [{ position: 1, label: "the list of loans", ran: "failed", happened: "The saved Flow could not be started, so nothing was done." }, { position: 2, ran: "not_reached" }],
      failing: { position: 1, label: "the list of loans", happened: "The saved Flow could not be started, so nothing was done.", code: "answer_first.flow_run_threw" }
    });
    expect(fixture.counts.arrived).toBe(false);
  });

  it("an identity refusal is the same: the Flow changed under the run", async () => {
    let digests = 0;
    const fixture = await flowRunFixture({ engine: (engine) => ({ ...engine, currentBaseDigest: async () => `digest.${(digests += 1)}` }) }, cleanups);
    const outcome = await ran(fixture);
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: false, failing: { position: 1, code: "candidate.execution_stale", happened: "The Flow changed while this run was going, so it did not go on." } });
    expect(fixture.target.presses).toEqual([]);
    expect(fixture.counts.arrived).toBe(false);
  });

  it("a step that raises a question ends the run and asks nobody", async () => {
    const target = libraryTarget();
    target.over = ({ nodeId }) => nodeId !== RENEW_CARD ? undefined : { status: "success", route: "success", outputs: { success: true }, effects: [automationStudioAskEffect({ kind: "confirm", parks: true, text: "Which card?" })] };
    const fixture = await flowRunFixture({ target, answer: "allow" }, cleanups);
    const outcome = await ran(fixture, [savedStep(1, RENEW_CARD)]);
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: false, failing: { position: 1, happened: "This step stopped for a person's answer, and a saved Flow's run asks nobody part way through." } });
    expect(fixture.asked).toEqual([]);
  });
});

describe("permission, once, before the run", () => {
  const destroying = () => [savedStep(1, READ_LOANS, { recordOutput: LOANS_OUTPUT }), savedStep(2, RENEW_CARD, {}, { consequences: ["delete"], label: "Cancel card" })];

  it("a decline is permission_declined and nothing is sent", async () => {
    const fixture = await flowRunFixture({ answer: "decline" }, cleanups);
    expect(await ran(fixture, destroying())).toEqual({ kind: "permission_declined", consequences: ["delete"] });
    expect(fixture.asked).toHaveLength(1);
    expect(fixture.target.reads).toBe(0);
    expect(fixture.target.presses).toEqual([]);
    expect(fixture.counts).toEqual({ liveSteps: 0, arrived: false });
  });

  it("asks with the domain's own words, and only once the Flow stands", async () => {
    const fixture = await flowRunFixture({
      answer: "decline",
      binding: { resolvePlanNodeParameters: async ({ parameters, permission, declaredConsequences }) => {
        if (declaredConsequences?.length) await permission({ consequences: declaredConsequences, control: { name: "Cancel card", kind: "button" }, verb: "press" });
        return { status: "resolved", parameters };
      } }
    }, cleanups);
    // The domain declares as it resolves each step, and a step after it cannot be assembled: nobody is asked about a Flow that will not run.
    expect(await ran(fixture, [...destroying(), savedStep(3, "domain.library.no_such_node")])).toMatchObject({ kind: "not_assembled" });
    expect(fixture.asked).toEqual([]);
    expect(await ran(fixture, destroying())).toEqual({ kind: "permission_declined", consequences: ["delete"] });
    expect(fixture.asked).toHaveLength(1);
    // The gate names only what it was shown: the step's own words are shown first (`./permission-words.test.ts`).
    expect(fixture.asked[0]).toMatch(/press/u);
    expect(fixture.asked[0]).toContain("Cancel card");
  });

  it("nobody to ask is the same: nothing is sent on a question nobody can answer", async () => {
    const fixture = await flowRunFixture({}, cleanups);
    expect(await ran(fixture, destroying())).toEqual({ kind: "permission_declined", consequences: ["delete"] });
    expect(fixture.target.presses).toEqual([]);
  });

  it("an allow runs it, asked before the first step and never during the run", async () => {
    const order: string[] = [];
    const target = libraryTarget();
    target.over = ({ nodeId }) => {
      order.push(`step ${nodeId} after ${fixture.asked.length} asked`);
      return undefined;
    };
    const fixture = await flowRunFixture({ target, answer: "allow" }, cleanups);
    const steps = [...destroying(), savedStep(3, RENEW_LOAN, { control: "Renew" }, { consequences: ["delete"], routing: { kind: "repeat", through: "saved.3", over: "saved.1" } })];
    expect(await ran(fixture, steps)).toMatchObject({ kind: "ran", reachedEnd: true });
    // One question for every step that declared the class, and every step went out after it.
    expect(fixture.asked).toHaveLength(1);
    expect(order.every((line) => line.endsWith("after 1 asked"))).toBe(true);
    expect(fixture.target.presses).toHaveLength(4);
  });

  it("a class the person already permitted asks nobody; a class no person is asked about asks nobody", async () => {
    const permitted = await flowRunFixture({ answer: "decline", permittedConsequences: ["delete"] }, cleanups);
    expect(await ran(permitted, destroying())).toMatchObject({ kind: "ran", reachedEnd: true });
    expect(permitted.asked).toEqual([]);
    const ordinary = await flowRunFixture({ answer: "decline" }, cleanups);
    expect(await ran(ordinary)).toMatchObject({ kind: "ran", reachedEnd: true });
    expect(ordinary.asked).toEqual([]);
  });

  it("a Stop while a question stands reads as stopped, and nothing is sent", async () => {
    const fixture = await flowRunFixture({ answer: "hang" }, cleanups);
    const running = ran(fixture, destroying());
    while (!fixture.asked.length) await new Promise((resolve) => setTimeout(resolve, 5));
    fixture.stop.abort();
    expect(await running).toEqual({ kind: "stopped" });
    expect(fixture.target.reads).toBe(0);
  });
});
