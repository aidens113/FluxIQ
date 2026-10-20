// The project supervisor's loop with a stub provider (a scripted list of
// decisions), a stub dispatcher and a stub whole trial
// (`./supervisor-fixture.ts`, run by `./supervisor-script.ts`): planning, dispatch order, refusals, triage,
// honest endings, the reset before the whole trial, the reserve, and
// completion only on a yes for the exact assembled revision.
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioActivityHub, runWithAutomationStudioActivity } from "../../../activity/index.ts";
import { AutomationStudioLlmBuildPurse } from "../../../llm/build-purse/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE, AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../index.ts";
import { BUILD, planInput, project, subflow, taskSpecInput, type BuilderPlan } from "./supervisor-fixture.ts";
import { FIND, HOLD, NOTE, assembled, brief, call, complete, dispatch, end, lastOf, reset, supervise, test } from "./supervisor-script.ts";

const ONE_PART = planInput([subflow("main", ["p1"])], taskSpecInput([["p1", FIND, []]]));
const TWO_PART = planInput([subflow("find_titles", ["p1"], { inputs: ["author"], outputs: ["titles"] }), subflow("place_hold", ["p2"], { inputs: ["titles"], outputs: ["shelf"] })], taskSpecInput([["p1", FIND, []], ["p2", HOLD, ["create_new"]]]));
const THREE_PART = planInput(
  [subflow("find_titles", ["p1"], { inputs: ["author"], outputs: ["titles"] }), subflow("place_hold", ["p2"], { inputs: ["titles"], outputs: ["shelf"] }), subflow("note_shelf", ["p3"], { inputs: ["shelf"] })],
  taskSpecInput([["p1", FIND, []], ["p2", HOLD, ["create_new"]], ["p3", NOTE, []]])
);

describe("the project supervisor", () => {
  it("plans a one-part task as one subflow, briefs it, assembles, tests and completes on the yes", async () => {
    const run = await supervise([call(IDS.writePlan, ONE_PART), dispatch([brief("main", ["p1"])]), call(IDS.assemble), test, complete]);
    expect(run.outcome.loop?.ok, JSON.stringify(run.outcome.loop)).toBe(true);
    expect(run.outcome.status).toBe("candidate");
    expect(run.outcome.trial?.verdict).toBe("yes");
    expect(run.outcome.promotionAllowed).toBe(false);
    expect(run.outcome.ending).toBeUndefined();
    // The free first look is the task, before any decision.
    expect(run.seen[0]!.toolId).toBe(IDS.readTask);
    expect((run.seen[0]!.value as JsonObject).instructions).toEqual([{ sourceId: "instruction.1", text: expect.stringContaining(FIND) }]);
    expect(run.summary?.plan?.subflows).toEqual(["main"]);
    expect(run.outcome.candidate?.buildPlan.plan.subflows.map((subflow) => subflow.key)).toEqual(["main"]);
    expect(run.view?.record.decisions.map((decision) => decision.entry.kind)).toEqual(["dispatch"]);
    expect(run.view?.record.receipts.map((receipt) => receipt.receipt.kind)).toEqual(["candidate_trial"]);
    expect(run.view?.record.ending).toBeUndefined();
  });

  it("offers the harness's observe-only tools and its own, and never a tool that acts or a whole candidate's submit", async () => {
    const run = await supervise([call(IDS.writePlan, ONE_PART)]);
    const offered = run.offered[0]!;
    expect(offered).toEqual(expect.arrayContaining(["web.page.read", "core.describe_nodes", IDS.writePlan, IDS.amendPlan, IDS.dispatch, IDS.assemble, IDS.testCandidate]));
    expect(offered).not.toContain("core.run_node");
    expect(offered).not.toContain("core.submit_candidate");
    expect(offered.filter((toolId) => toolId === IDS.dispatch)).toHaveLength(1);
  });

  it("dispatches a three-part plan's briefs in dependency order, binds each part's input to the earlier output and composes the whole candidate", async () => {
    const run = await supervise([
      call(IDS.writePlan, THREE_PART),
      dispatch([brief("note_shelf", ["p3"], ["place_hold"]), brief("place_hold", ["p2"], ["find_titles"], { permittedActs: ["create_new"] }), brief("find_titles", ["p1"])]),
      call(IDS.assemble),
      test,
      dispatch([reset()], "Put the target back before the whole test."),
      test,
      complete
    ]);
    expect(run.outcome.status, JSON.stringify(run.outcome.loop)).toBe("candidate");
    expect(run.dispatched[0]!.briefs.map((sent) => sent.subflowKey)).toEqual(["find_titles", "place_hold", "note_shelf"]);
    const answer = lastOf(run.seen, IDS.assemble)!;
    expect(answer.calls).toEqual({ subflowKey: "main", inOrder: ["find_titles", "place_hold", "note_shelf"] });
    expect(answer.flowInputs).toEqual([{ subflowKey: "find_titles", input: "author" }]);
    const main = run.outcome.candidate!.buildPlan.plan.subflows.find((subflow) => subflow.key === "main")!;
    expect(main.nodes.map((node) => [node.parameters?.subflowId, node.parameters?.inputs])).toEqual([
      ["find_titles", { author: { $state: { path: "author" } } }],
      ["place_hold", { titles: { $state: { path: "$node.s1.titles" } } }],
      ["note_shelf", { shelf: { $state: { path: "$node.s2.shelf" } } }]
    ]);
    expect(run.outcome.candidate!.buildPlan.plan.subflows.find((subflow) => subflow.key === "place_hold")?.interface?.outputs.map((port) => port.id)).toEqual(["shelf"]);
  });

  it("refuses the whole trial while the build's lasting acts are in place, naming a reset brief, and runs it once the reset came back", async () => {
    const run = await supervise([
      call(IDS.writePlan, TWO_PART),
      dispatch([brief("find_titles", ["p1"]), brief("place_hold", ["p2"], ["find_titles"], { permittedActs: ["create_new"] })]),
      call(IDS.assemble),
      test,
      dispatch([reset()], "Put the target back before the whole test."),
      test,
      complete
    ]);
    expect(run.outcome.status).toBe("candidate");
    const tests = run.seen.filter((entry) => entry.toolId === IDS.testCandidate).map((entry) => entry.value as JsonObject);
    expect(tests[0]).toMatchObject({ ok: false, code: "project.trial_reset_required", actsInPlace: [{ act: "act-1", brief: "brief-2" }] });
    expect(String(tests[0]!.instruction)).toContain("project.dispatch");
    expect(tests[1]).toMatchObject({ verdict: "yes" });
    expect(run.trials).toHaveLength(1);
    expect(run.dispatched[1]!.briefs.map((sent) => sent.kind)).toEqual(["reset"]);
    // A reset comes back done with no proposal, and is read as done.
    expect(lastOf(run.seen, IDS.dispatch)).toMatchObject({ ok: true, returns: [{ kind: "reset", outcome: "done" }] });
  });

  it("clears what a whole trial left once a reset came back done, and refuses a survey brief", async () => {
    const run = await supervise([
      call(IDS.writePlan, ONE_PART),
      dispatch([{ kind: "survey", subflowKey: "main", parts: ["p1"], entry: { caseId: "observed-current", predecessors: [] }, allowanceUsd: 0.01, maxIterations: 5 }]),
      dispatch([brief("main", ["p1"])]),
      call(IDS.assemble),
      test,
      test,
      dispatch([reset()], "Undo what the judged-no trial left."),
      test,
      end("blocked", "Judged no twice.")
    ], project({ trial: () => "unsure", trialActs: true }));
    const answers = run.seen.filter((entry) => entry.toolId === IDS.dispatch);
    expect(run.dispatched.map((request) => request.briefs.map((sent) => sent.kind))).toEqual([["build"], ["reset"]]);
    const tests = run.seen.filter((entry) => entry.toolId === IDS.testCandidate).map((entry) => entry.value as JsonObject);
    expect(tests.map((value) => value.code ?? value.verdict)).toEqual(["unsure", "project.trial_reset_required", "unsure"]);
    expect(answers).toHaveLength(3);
    expect(run.trials).toHaveLength(2);
  });

  it("refuses a plan that leaves a part uncovered, and a dispatch before any plan", async () => {
    const uncovered = planInput([subflow("find_titles", ["p1"], { inputs: ["author"], outputs: ["titles"] })], taskSpecInput([["p1", FIND, []], ["p2", HOLD, ["create_new"]]]));
    const run = await supervise([dispatch([brief("main", ["p1"])]), call(IDS.writePlan, uncovered), end("blocked")]);
    const dispatched = lastOf(run.seen, IDS.dispatch)!;
    expect(dispatched).toMatchObject({ ok: false, code: "project.plan_missing" });
    const written = lastOf(run.seen, IDS.writePlan)!;
    expect(written).toMatchObject({ ok: false, code: "project.plan_refused" });
    expect(written.issues).toEqual(expect.arrayContaining([{ code: "project.plan_part_uncovered", path: "taskSpec.parts.1", why: GUIDANCE.planIssues["project.plan_part_uncovered"] }]));
    expect(run.dispatched).toHaveLength(0);
    expect(run.summary?.plan).toBeUndefined();
    // Out of turns with nothing built: an honest ending, recorded.
    expect(run.outcome.status).toBe("ended");
    expect(run.outcome.ending?.outcome).toBe("blocked");
  });

  it("refuses words a part did not copy from the instruction, and a brief whose predecessor is not done", async () => {
    const invented = planInput([subflow("main", ["p1"])], taskSpecInput([["p1", "Find every title ever written", []]]));
    const run = await supervise([call(IDS.writePlan, invented), call(IDS.writePlan, TWO_PART), dispatch([brief("place_hold", ["p2"], ["find_titles"], { permittedActs: ["create_new"] })]), end("blocked")]);
    const writes = run.seen.filter((entry) => entry.toolId === IDS.writePlan).map((entry) => entry.value as JsonObject);
    expect(writes[0]).toMatchObject({ ok: false, issues: [{ code: "project.quote_not_verbatim", path: "taskSpec.parts.0.quote.text" }] });
    expect(writes[1]).toMatchObject({ ok: true });
    expect(lastOf(run.seen, IDS.dispatch)).toMatchObject({ ok: false, code: "project.predecessor_not_done", issues: [{ path: "briefs.0.entry.predecessors.0" }] });
    expect(run.dispatched).toHaveLength(0);
  });

  it("re-briefs a subflow whose return came back blocked, logging the triage, and goes on to a yes", async () => {
    const builder: BuilderPlan = (_brief, attempt) => (attempt === 1 ? "blocked" : "done");
    const run = await supervise([
      call(IDS.writePlan, ONE_PART),
      dispatch([brief("main", ["p1"])]),
      dispatch([brief("main", ["p1"], [], { recordingExcerpt: "The catalogue's search box is under Browse." })], "The builder could not find the control; it is under Browse."),
      call(IDS.assemble),
      test,
      complete
    ], project({ builder }));
    const answers = run.seen.filter((entry) => entry.toolId === IDS.dispatch).map((entry) => entry.value as JsonObject);
    expect(answers[0]).toMatchObject({ ok: true, returns: [{ briefId: "brief-1", outcome: "blocked" }] });
    expect(String(answers[0]!.next)).toContain("partial or blocked");
    expect(answers[1]).toMatchObject({ ok: true, returns: [{ briefId: "brief-2", outcome: "done" }] });
    expect(run.view?.record.decisions.map((decision) => decision.entry.kind)).toEqual(["dispatch", "triage"]);
    expect(run.outcome.status).toBe("candidate");
  });

  it("ends honestly once a return came back blocked, and not before", async () => {
    const run = await supervise([
      call(IDS.writePlan, ONE_PART),
      end("blocked"),
      dispatch([brief("main", ["p1"])]),
      end("blocked"),
      end("blocked")
    ], project({ builder: () => "blocked" }), { spareTurns: 3 });
    // Too soon before any return; then held once for a changed brief of the failed subflow (t743), and let through.
    expect(run.feedback.map((entry) => entry.code)).toEqual(["project.completion_ended_too_soon", "project.completion_repair_first"]);
    expect(run.outcome.status).toBe("ended");
    expect(run.outcome.ending).toMatchObject({ outcome: "blocked", reason: "The hold control is not on the page." });
    expect(run.view?.record.ending?.outcome).toBe("blocked");
    expect(run.view?.record.decisions.at(-1)?.entry.kind).toBe("ending");
  });

  it("completes only on a yes for the exact assembled revision", async () => {
    const run = await supervise([
      call(IDS.writePlan, ONE_PART),
      () => ({ kind: "complete", result: { revision: 1, digest: "a".repeat(64) } }),
      dispatch([brief("main", ["p1"])]),
      call(IDS.assemble),
      complete,
      (evidence) => ({ kind: "complete", result: { ...assembled(evidence), digest: "f".repeat(64) } }),
      test,
      complete,
      test,
      end("blocked", "The whole test was judged no."),
      dispatch([reset()], "Put the target back before ending."),
      end("blocked", "The whole test was judged no.")
    ], project({ trial: () => "no", trialActs: true }));
    const codes = run.feedback.map((entry) => entry.code);
    // The ending waits for the reset of what the judged-no trial left (bigbox debug fix 10).
    expect(codes).toEqual(["project.completion_nothing_assembled", "candidate.trial_required", "project.completion_not_latest", "candidate.trial_unchanged_after_no", "project.completion_reset_first"]);
    // The judged-no trial's act is in the ledger, under the supervisor; the same revision is not tested again after its no.
    expect(lastOf(run.seen, IDS.testCandidate)).toMatchObject({ ok: false, code: "candidate.trial_unchanged_after_no" });
    expect(run.ledger.snapshot().acts).toEqual([expect.objectContaining({ owner: "supervisor" })]);
    expect(run.trials).toHaveLength(1);
    expect(run.outcome.status).toBe("ended");
    expect(run.outcome.ending?.outcome).toBe("blocked");
  });

  it("holds an honest ending until a reset brief came back, while the build's lasting acts are on the target (bigbox debug fix 10)", async () => {
    const builder: BuilderPlan = (sent) => (sent.subflowKey === "note_shelf" ? "blocked" : "done");
    const briefs = [brief("find_titles", ["p1"]), brief("place_hold", ["p2"], ["find_titles"], { permittedActs: ["create_new"] }), brief("note_shelf", ["p3"], ["place_hold"])];
    const run = await supervise([
      call(IDS.writePlan, THREE_PART),
      dispatch(briefs),
      end("blocked", "The shelf is not shown."),
      // Held once for a changed brief of the failed subflow first (t743).
      end("blocked", "The shelf is not shown."),
      dispatch([reset()], "Put the target back before ending."),
      end("blocked", "The shelf is not shown.")
    ], project({ builder }));
    const held = run.feedback.find((entry) => entry.code === "project.completion_reset_first")!;
    expect(held.actsInPlace).toEqual([{ act: "act-1", did: "trial step 1 \"press hold for place_hold\"", brief: "brief-2" }]);
    expect(run.ledger.snapshot().acts.every((act) => !act.inPlace)).toBe(true);
    // Nothing is left, so the reason is the model's own.
    expect(run.outcome.ending).toMatchObject({ outcome: "blocked", reason: "The shelf is not shown." });
  });

  it("lets an ending with acts still in place through after two holds, and names exactly what is left in its reason", async () => {
    const builder: BuilderPlan = (sent) => (sent.subflowKey === "note_shelf" ? "blocked" : "done");
    const briefs = [brief("find_titles", ["p1"]), brief("place_hold", ["p2"], ["find_titles"], { permittedActs: ["create_new"] }), brief("note_shelf", ["p3"], ["place_hold"])];
    const run = await supervise([call(IDS.writePlan, THREE_PART), dispatch(briefs), ...Array.from({ length: 4 }, () => end("blocked", "The shelf is not shown."))], project({ builder }), { spareTurns: 3 });
    expect(run.feedback.map((entry) => entry.code)).toEqual(["project.completion_repair_first", "project.completion_reset_first", "project.completion_reset_first"]);
    expect(run.ledger.snapshot().acts.filter((act) => act.inPlace)).toHaveLength(1);
    expect(run.outcome.ending).toMatchObject({ outcome: "blocked", reason: "The shelf is not shown. Still on the target from this build: trial step 1 \"press hold for place_hold\"." });
    expect(run.view?.record.ending?.reason).toContain("press hold for place_hold");
  });

  it("answers a written plan with its warnings and says to amend it if one applies (bigbox debug fix 7)", async () => {
    // The second decision is only there to be shown the plan's answer.
    const run = await supervise([call(IDS.writePlan, THREE_PART), end("blocked")]);
    const written = lastOf(run.seen, IDS.writePlan)!;
    expect(written).toMatchObject({ ok: true, written: "plan" });
    expect(written.warnings).toEqual([{ code: "project.plan_subflow_constraint", path: "subflows.2", instruction: expect.stringContaining("notAsked") }]);
    expect(String(written.next)).toContain("project.amend_plan");
  });

  it("keeps the judged whole run's reserve from every brief and sizes each brief itself, so the judge is paid after the builders spent", async () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.5 });
    const price = (input: number, output: number) => (input + output) * 0.0001;
    const primed = purse.hold({ projectedCostUsd: 0.001, estimatedInputTokens: 5, maxOutputTokens: 5, price });
    if (!primed.ok) throw new Error("priming refused");
    primed.hold.settle();
    const judged: boolean[] = [];
    const built = project({
      purse,
      reserve: { calls: 2, unpriced: { inputTokens: 1000, outputTokens: 0 } },
      onBrief: (sent) => {
        const carved = purse.allowance({ briefId: sent.briefId, role: "builder", usd: sent.allowanceUsd });
        if (!carved.ok) throw new Error("allowance refused");
        const spent = carved.allowance.hold({ projectedCostUsd: sent.allowanceUsd - 0.001, estimatedInputTokens: 10, maxOutputTokens: 10 });
        if (spent.ok) spent.hold.settle();
        carved.allowance.close();
      },
      onTrial: () => {
        for (let index = 0; index < 2; index += 1) {
          const held = purse.hold({ judge: true, projectedCostUsd: 0.1, estimatedInputTokens: 1000, maxOutputTokens: 0, price });
          judged.push(held.ok);
          if (held.ok) held.hold.settle();
        }
      }
    });
    const run = await supervise([
      call(IDS.writePlan, ONE_PART),
      // More than its share is lowered to the share, never refused (t570).
      dispatch([brief("main", ["p1"], [], { allowanceUsd: 0.35 })]),
      // No money and no turns: Core gives it its share.
      dispatch([{ kind: "build", subflowKey: "main", parts: ["p1"] }]),
      call(IDS.assemble),
      test,
      complete
    ], built);
    const money = lastOf(run.seen, IDS.readTask)!.money as JsonObject;
    expect(money.keptBackUsd).toBeCloseTo(0.2, 6);
    expect(money.canGiveUsd).toBeCloseTo(0.299, 6);
    const answers = run.seen.filter((entry) => entry.toolId === IDS.dispatch).map((entry) => entry.value as JsonObject);
    // What can be given (0.299) over this brief and the build's own finishing share.
    const given = answers.map((answer) => ((answer.returns as JsonObject[])[0]!.given as JsonObject));
    expect(answers.map((answer) => answer.ok)).toEqual([true, true]);
    expect(given[0]!.allowanceUsd).toBeCloseTo(0.1495, 6);
    expect(given[1]!.allowanceUsd).toBeCloseTo((0.5 - 0.1495 - 0.2) / 2, 6);
    expect(given[1]!.maxIterations).toBe(30);
    run.dispatched.forEach((request, index) => expect(request.briefs[0]!.allowanceUsd).toBeCloseTo(given[index]!.allowanceUsd as number, 6));
    expect(judged).toEqual([true, true]);
    expect(run.outcome.status).toBe("candidate");
    expect(run.view?.record.allowances[0]).toMatchObject({ role: "supervisor" });
    expect(run.view?.record.allowances[0]!.usd).toBeCloseTo(0.2, 6);
  });

  it("puts the plan, each brief, each return and the whole trial in the chat as cards, as the supervisor", async () => {
    const events: ClientGatewayActivity[] = [];
    const unsubscribe = automationStudioActivityHub.subscribe((event) => events.push(event));
    try {
      await runWithAutomationStudioActivity({ kind: "build", id: "build-cards", projectId: BUILD.projectId }, () => supervise([call(IDS.writePlan, ONE_PART), dispatch([brief("main", ["p1"])]), call(IDS.assemble), test, complete]));
    } finally {
      unsubscribe();
    }
    const cards = events.filter((event) => event.detail?.project).map((event) => [event.detail!.project!.kind, event.agent?.role]);
    expect(cards).toEqual([["plan", "supervisor"], ["brief", "supervisor"], ["return", "supervisor"], ["receipt", "supervisor"]]);
  });
});
