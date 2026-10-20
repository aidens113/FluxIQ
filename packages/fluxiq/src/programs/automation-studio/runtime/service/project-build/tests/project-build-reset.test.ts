// @fluxiq-test-group real-sql
// A project build whose builder leaves a lasting act, through the actual
// service (t551): a scripted model plays the supervisor, the builders and the
// reset agent; a stub domain is a recipe site where "Save" puts a recipe in
// the person's box and "Unsave" takes it out, every lasting press put to the
// permission check first with the item its control sits in. The box held one
// recipe before the build.
//
// The supervisor's whole trial is refused while the builder's save is still
// on the site; a reset brief then undoes exactly that act -- never the recipe
// that was there before -- and comes back done; only then does the whole trial
// run, and the Flow is proposed. The act is in the build record.
//
// The second case is the shape a reset could not undo before builders' acts
// were placed: a shop's "Add to cart", a control in no item, adds a line to the
// cart drawer on the product page. The builder's press is read around in place,
// so the line it created is the act's own; the reset removes that line, and the
// line the cart held before the build is kept. The reset agent's first
// request already names that act as its task, how it was done and the page it
// was made on, in place of the person's build instruction (t585).
//
// In both, the builder makes its act after its own subflow trial passed: a
// builder's trial now undoes the build's acts first (t578), so an act made
// before it would be undone there, not left for the supervisor's whole trial.
//
// The builder's part asks a lasting act, so its subflow declares the step that
// does it, as a real script must (t597). Its own trial of that step is the
// build's first act (act-1), and its explored press the second (act-2).
//
// On the recipe site, which has no start hook, that trial's save is the
// site's own Save node, and the host runtime's state diff around each step
// lists the recipes the box showed before and after it (t598). So the trial's
// act carries the recipe it put in the box, and the reset undoes it by that
// item, as it undoes the explored save by its own: the whole trial then runs
// on the box as the build found it. The save is no Core wait: a wait that
// declares `create_new` acts on nothing outside the run and leaves no act
// (t598). The shop below has no state diff, so its trial's
// add names no cart line: no control there takes it back, and the reset
// names act-1 under `cannotUndo`, as before.
//
// **Nothing here waits on the wall clock (t644).** Under load these builds
// took up to 45 s against 1-5 s quiet, near the 60 s watchdog, and a timed-out
// build, still writing, then failed the directory's removal (t616). The one
// real wait on their path was the reset's settled read: two reads of the page
// a second apart (`flow-bootstrap/site-reset/settle-ms.ts`), about a second per
// read here, though these stub sites never change by themselves. It is held at
// zero below, so both reads still happen, back to back, and nothing a test
// asserts depends on time passing between them. The build's own bounds are
// never reached, so the watchdog is a hang guard only, and cleanup stops any
// build still running and waits for it before removing its directory
// (`./settled-builds.ts`).

// **On a plan of two subflows (t679).** A plan of one subflow the router runs
// tests its builder's proposal as the judged whole run, with no reset brief
// between a subflow trial and a whole trial
// (`project-agents/single-subflow/`, `./project-build-single-subflow.test.ts`).
// What these cases test -- a whole trial refused until a reset brief undoes the
// builders' acts, and the reset brief itself -- is a plan of several subflows',
// so the task is two parts: one that prepares and acts on nothing (`prepare`),
// and the one whose builder makes the lasting act (`keep`). Core adds the
// router-run subflow that calls them in turn.

import { mkdtemp, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { ProgramJsonStore } from "../../../../../_shared/storage.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { AutomationStudioActionConsequence, AutomationStudioActionDeclaration, AutomationStudioActionPermissionCheck } from "../../../action-permissions/index.ts";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { automationStudioActivityHub } from "../../../activity/index.ts";
import { parseAutomationStudioFlowBootstrapGenerationError } from "../../../flow-bootstrap/index.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS, AutomationStudioSiteResetLedger, AutomationStudioSiteResetProjectLedger } from "../../../flow-bootstrap/site-reset/index.ts";
import type { AutomationStudioHostRuntimeBoundary, AutomationStudioHostStateSnapshotRef } from "../../../host-runtime.ts";
import { createAutomationStudioDeepSeekProvider } from "../../../llm/deepseek/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding, AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AutomationStudioService, type AutomationStudioServiceOptions } from "../../../service.ts";
import { blankFixture, caller, judgeReply, mockProvider } from "../../../tests/service-bootstrap/tests/fixtures.ts";
import * as trialPorts from "../../candidate-trial/index.ts";
import { automationStudioProjectBuildWholeTrials } from "../whole-trials.ts";
import { automationStudioProjectBuildResetCalls } from "../reset-calls.ts";
import { automationStudioTestDeclaredStepResolution } from "./declared-step-resolution.ts";
import { automationStudioTestSettledBuilds } from "./settled-builds.ts";

// The reset's settled read, its two reads back to back (header).
vi.mock("../../../flow-bootstrap/site-reset/index.ts", async (original) => ({ ...(await original<object>()), AUTOMATION_STUDIO_SITE_RESET_SETTLE_MS: 0 }));
// A hang guard only (header).
vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

/** The fixture instruction's words (`blankFixture`). */
const TASK = "Create a deterministic Start to End Flow.";

type Entry = { callId: string; toolId: string; value: unknown };
const lastOf = (evidence: readonly Entry[], toolId: string) => [...evidence].reverse().find((entry) => entry.toolId === toolId)?.value as JsonObject | undefined;
const decision = (decided: JsonObject) => ({ response: { kind: "evidence_tool_decision", summary: "Scripted", decision: decided }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.0001 } });

const PLAN = {
  taskSpec: {
    parts: [
      { id: "p1", quote: { sourceId: "instruction.build", text: "Create a deterministic" }, goalFacts: ["The Flow is deterministic"], lastingActs: [] },
      { id: "p2", quote: { sourceId: "instruction.build", text: "Start to End Flow." }, goalFacts: ["The Flow runs from its start to its end"], lastingActs: ["create_new"] }
    ],
    notAsked: []
  },
  subflows: [{ key: "prepare", name: "Prepare", parts: ["p1"] }, { key: "keep", name: "Keep", parts: ["p2"] }]
};
/** Both subflows' briefs, in one dispatch: the one that acts on nothing first (header). */
const BUILD_BRIEFS = [
  { kind: "build", subflowKey: "prepare", parts: ["p1"], entry: { caseId: "observed-current", predecessors: [] }, allowanceUsd: 0.01, maxIterations: 12 },
  { kind: "build", subflowKey: "keep", parts: ["p2"], entry: { caseId: "observed-current", predecessors: [] }, allowanceUsd: 0.01, maxIterations: 12, permittedActs: ["create_new"] }
];
/** The subflow that acts on nothing: one short wait. */
const PREPARE_SUBMISSION = { flow: ["flow: Prepare", "part prepare: get ready", "  step pause: wait briefly", "    node: builtin.timing.wait", "    duration: 1", "    unit: milliseconds", "end"].join("\n") };
const RESET_BRIEF = { kind: "reset", subflowKey: "main", parts: [], entry: { caseId: "observed-current", predecessors: [] }, allowanceUsd: 0.005, maxIterations: 4 };
/** The recipe site's own Save node, which a Flow's run presses (header, t598). */
const SAVE = "domain.isolated.save-recipe";
/** The recipe the subflow's save puts in the box; the builder's explored press saves another. */
const TRIAL_RECIPE = "recipe:rye-loaf";
/**
 * The builder's subflow. Its part asks a lasting act, so the step that does it declares it, as a real script must (t597):
 * on the recipe site its own Save (t598: a Core wait declaring it would leave nothing); in the shop, its own Add to cart.
 */
const RECIPE_SUBMISSION = { flow: ["flow: Keep", "part keep: keep the recipe", "  step save: save the recipe", `    node: ${SAVE}`, `    recipe: ${TRIAL_RECIPE}`, "    consequences: create_new", "end"].join("\n") };
/** The same subflow with its save's step declaring nothing lasting. */
const UNDECLARED_RECIPE_SUBMISSION = { flow: ["flow: Keep", "part keep: keep the recipe", "  step save: save the recipe", `    node: ${SAVE}`, `    recipe: ${TRIAL_RECIPE}`, "end"].join("\n") };
const CART_SUBMISSION = { flow: ["flow: Keep", "part keep: keep the item", "  step add: add it to the cart", "    node: domain.example.add-to-cart", "    consequences: create_new", "end"].join("\n") };

/** The `prepare` builder's next decision: submit its wait, test it, complete on its yes. */
function prepareDecision(submitted: JsonObject | undefined, tested: JsonObject | undefined): JsonObject {
  if (submitted?.ok !== true) return { kind: "tool_call", callId: "submit.prepare", toolId: "core.submit_subflow", input: PREPARE_SUBMISSION };
  if (tested?.verdict !== "yes") return { kind: "tool_call", callId: "test.prepare", toolId: "core.test_subflow", input: { revision: submitted.revision as number, digest: submitted.digest as string } };
  return { kind: "complete", result: { subflowKey: "prepare", revision: submitted.revision as number, digest: submitted.digest as string } };
}

/** The build record's main file, read off disk as a restarted Core would find it. */
async function storedRecord(dataDir: string): Promise<JsonObject> {
  const files = (await readdir(dataDir, { recursive: true })).map((file) => file.toString()).filter((file) => file.split(path.sep).includes("project-builds") && path.basename(file) === "build.json");
  expect(files).toHaveLength(1);
  return await new ProgramJsonStore<JsonObject>(path.join(dataDir, files[0]!), () => ({})).read();
}

/** What the supervisor ends with when its reset could not undo the save (t590). */
const ENDED_REASON = "The saved recipe could not be taken out of the box again.";

/**
 * The supervisor's script, the same in both cases: plan, build, assemble, test
 * (refused), reset, test, complete. With `ends`: plan, build, a reset that
 * undoes nothing, then an honest ending.
 */
function supervisorDecision(step: number, evidence: readonly Entry[], ends = false): JsonObject {
  const assembled = lastOf(evidence, "project.assemble")?.complete as JsonObject | undefined;
  if (ends) {
    if (step === 1) return { kind: "tool_call", callId: "plan", toolId: "project.write_plan", input: PLAN };
    if (step === 2) return { kind: "tool_call", callId: "dispatch", toolId: "project.dispatch", input: { reason: "Build both subflows.", briefs: BUILD_BRIEFS } };
    if (step === 3) return { kind: "tool_call", callId: "reset", toolId: "project.dispatch", input: { reason: "Put the site back before ending.", briefs: [RESET_BRIEF] } };
    return { kind: "complete", result: { ended: "blocked", reason: ENDED_REASON } };
  }
  switch (step) {
    case 1: return { kind: "tool_call", callId: "plan", toolId: "project.write_plan", input: PLAN };
    case 2: return { kind: "tool_call", callId: "dispatch", toolId: "project.dispatch", input: { reason: "Build both subflows.", briefs: BUILD_BRIEFS } };
    case 3: return { kind: "tool_call", callId: "assemble", toolId: "project.assemble", input: {} };
    case 4: return { kind: "tool_call", callId: "test.1", toolId: "core.test_candidate", input: assembled ?? {} };
    case 5: return { kind: "tool_call", callId: "reset", toolId: "project.dispatch", input: { reason: "Put the site back before the whole test.", briefs: [RESET_BRIEF] } };
    case 6: return { kind: "tool_call", callId: "test.2", toolId: "core.test_candidate", input: assembled ?? {} };
    default: return { kind: "complete", result: assembled ?? {} };
  }
}

/**
 * `undeclaredFirst`: the builder first sends its subflow with the save's step declaring nothing lasting, as A8 launch 7's
 * dependent builders did (t594), and only then the declared one. `resetSentAs`: the reset agent's requests go through the
 * real DeepSeek adapter (`throughDeepSeek`), changed by it first.
 */
async function recipeBuild(options: { ends?: boolean; undeclaredFirst?: boolean; resetSentAs?: (request: AutomationStudioLlmTaskRequest) => AutomationStudioLlmTaskRequest } = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-project-build-reset-"));
  /** The person's recipe box: one recipe was there before the build. */
  const box = new Set(["recipe:lentil-soup"]);
  const pressed: string[] = [];
  const boxWhenWholeJudged: string[][] = [];
  const supervisorSaw: Record<number, readonly Entry[]> = {};
  /** The builder's evidence at its latest decision. */
  const builderSaw: Entry[] = [];
  let supervisorDecisions = 0;
  const scripted = mockProvider(async (request) => {
    const loop = request.context.evidenceLoop;
    if (request.taskKind === "loop_verification") {
      const scoped = JSON.stringify(request.context).includes("This trial ran only the subflow");
      if (!scoped) boxWhenWholeJudged.push([...box]);
      return judgeReply("yes");
    }
    const evidence = (loop?.evidence ?? []) as Entry[];
    const tools = (loop?.tools ?? []).map((tool) => tool.toolId);
    // The instruction's own read: no answer, so nothing it asks for is read as lasting or not.
    if (!tools.length) return decision({ kind: "tool_call", callId: "read", toolId: "none", input: {} });
    if (tools.includes("project.write_plan")) {
      supervisorDecisions += 1;
      supervisorSaw[supervisorDecisions] = evidence.map((entry) => ({ ...entry }));
      return decision(supervisorDecision(supervisorDecisions, evidence, options.ends));
    }
    const properties = (loop!.completionSchema.properties ?? {}) as JsonObject;
    if (properties.summary !== undefined && properties.subflowKey === undefined) {
      // The reset agent: undo the build's own save, named by its act, then complete; where the build ends instead, it finds no way to.
      if (options.ends) return decision({ kind: "tool_call", callId: `look.${evidence.length}`, toolId: "inspect", input: { at: evidence.length } });
      // act-2 is the builder's explored save; act-1 its own trial of the save, which carries the recipe that trial put in the box (t598).
      if (!evidence.some((entry) => entry.callId === "undo.save")) return decision({ kind: "tool_call", callId: "undo.save", toolId: "press", input: { control: "Unsave", item: "recipe:herb-bread", undoes: "act-2" } });
      if (!evidence.some((entry) => entry.callId === "undo.trial")) return decision({ kind: "tool_call", callId: "undo.trial", toolId: "press", input: { control: "Unsave", item: TRIAL_RECIPE, undoes: "act-1" } });
      return decision({ kind: "complete", result: { summary: "The recipes this build saved are out of the box again." } });
    }
    const subflowKey = (properties.subflowKey as JsonObject | undefined)?.const as string;
    const submitted = lastOf(evidence, "core.submit_subflow");
    const tested = lastOf(evidence, "core.test_subflow");
    // The subflow that acts on nothing (header).
    if (subflowKey === "prepare") return decision(prepareDecision(submitted, tested));
    builderSaw.splice(0, builderSaw.length, ...evidence.map((entry) => structuredClone(entry)));
    if (!submitted && options.undeclaredFirst) return decision({ kind: "tool_call", callId: "submit.undeclared", toolId: "core.submit_subflow", input: UNDECLARED_RECIPE_SUBMISSION });
    if (submitted?.ok !== true) return decision({ kind: "tool_call", callId: "submit", toolId: "core.submit_subflow", input: RECIPE_SUBMISSION });
    if (tested?.verdict !== "yes") return decision({ kind: "tool_call", callId: "test", toolId: "core.test_subflow", input: { revision: submitted.revision as number, digest: submitted.digest as string } });
    // The save comes after the builder's own passing trial, which would otherwise have it undone first (t578), so it is still on the site for the whole trial.
    if (!lastOf(evidence, "press")) return decision({ kind: "tool_call", callId: "save", toolId: "press", input: { control: "Save", item: "recipe:herb-bread" } });
    return decision({ kind: "complete", result: { subflowKey, revision: submitted.revision as number, digest: submitted.digest as string } });
  });
  const provider = options.resetSentAs ? throughDeepSeek(scripted, { only: isResetRequest, altered: options.resetSentAs }) : scripted;
  const serviceOptions: AutomationStudioServiceOptions = {
    dataDir, llmProviderResolver: () => ({ provider, maxCallsPerRun: 80, maxEstimatedCostUsd: 0.1 }),
    llmEvidenceRuntime: {
      domainId: "isolated", deniedEvidenceKeys: [], resolvePlanNodeParameters: automationStudioTestDeclaredStepResolution,
      tools: [
        { toolId: "inspect", description: "Inspect", inputSchema: { type: "object" }, effect: "observe" },
        { toolId: "press", description: "Press a control on one recipe", inputSchema: { type: "object", properties: { control: { type: "string" }, item: { type: "string" } } }, effect: "mutate" }
      ],
      executeTool: async (call: { toolId: string; value: JsonObject; permission?: AutomationStudioActionPermissionCheck }) => {
        if (call.toolId !== "press") return { kind: "llm_evidence_tool_execution", evidence: { box: [...box] }, effectApplied: false, targetsUnchanged: true };
        const control = String(call.value.control);
        const item = String(call.value.item);
        // As a real domain does, the lasting press is put to the gate first, with the item its control sits in.
        const declaration: AutomationStudioActionDeclaration = { consequences: control === "Save" ? ["create_new"] : ["modify_existing"], control: { name: control, kind: "button", item }, verb: "press", effect: "mutate" };
        const verdict = await call.permission!(declaration);
        if (!verdict.permitted) return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "permission_required" }, effectApplied: false, targetsUnchanged: true };
        pressed.push(`${control} ${item}`);
        if (control === "Save") box.add(item);
        else box.delete(item);
        return { kind: "llm_evidence_tool_execution", evidence: { ok: true, box: [...box] }, effectApplied: true, targetsUnchanged: false };
      }
    } as unknown as NonNullable<AutomationStudioServiceOptions["llmEvidenceRuntime"]>
  };
  const service = new AutomationStudioService(serviceOptions);
  service.bindNativeNodeRuntime(recipeRuntime(box, pressed));
  service.bindHostRuntime(boxDiffs(box));
  const builds = automationStudioTestSettledBuilds(service, dataDir);
  cleanups.push(builds.cleanup);
  const { project, flow } = await blankFixture(service, "active", "isolated");
  const record = () => storedRecord(dataDir);
  return {
    box, pressed, boxWhenWholeJudged, supervisorSaw, builderSaw, record,
    build: () => builds.track(project.id, flow.flowId, service.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, caller: caller(), evidenceGuided: true, authoringMode: "project" }))
  };
}

describe("a project build whose builder leaves a lasting act", () => {
  it("refuses the whole trial until a reset brief undoes exactly the build's act, then runs it and proposes the Flow", async () => {
    const run = await recipeBuild();
    const result = await run.build();
    if (result.status !== "proposed") throw new Error(`expected a proposal, got ${JSON.stringify(result)}`);

    // The first whole trial was refused, naming the builder's acts still on the site: its own trial of the save (t597), and its save.
    expect(lastOf(run.supervisorSaw[5]!, "core.test_candidate")).toMatchObject({ ok: false, code: "project.trial_reset_required", actsInPlace: [{ act: "act-1", did: "trial step 3 \"save the recipe\"" }, { act: "act-2", did: "press button" }] });
    // The reset brief came back done, naming nothing it could not undo, and nothing of the build was left in place.
    expect(lastOf(run.supervisorSaw[6]!, "project.dispatch")).toMatchObject({ ok: true, returns: [{ outcome: "done" }], lastingActsInPlace: 0 });
    // It pressed only the build's own recipes: the explored save's, on its own item, and the builder's trial's, on the item that
    // trial's own diff showed it put in the box (t598) -- though that trial ran its save inside a called part, whose call's own
    // diff, listed before the part's steps, already showed the recipe (t684). The one saved before the build was never touched.
    // Only then did the whole trial run, saving its recipe again.
    expect(run.pressed).toEqual([`run Save ${TRIAL_RECIPE}`, "Save recipe:herb-bread", "Unsave recipe:herb-bread", `Unsave ${TRIAL_RECIPE}`, `run Save ${TRIAL_RECIPE}`]);
    expect([...run.box]).toEqual(["recipe:lentil-soup", TRIAL_RECIPE]);
    // The whole trial ran once, after the reset, on the site as the build found it, and saved its recipe: a first answer and its confirmation.
    expect(run.boxWhenWholeJudged).toEqual([["recipe:lentil-soup", TRIAL_RECIPE], ["recipe:lentil-soup", TRIAL_RECIPE]]);
    const judged = lastOf(run.supervisorSaw[7]!, "core.test_candidate");
    expect(judged).toMatchObject({ verdict: "yes" });
    expect(judged).not.toHaveProperty("startedWith");

    // The builder's acts are in the build record, with the class each declared (the control's name withheld, as the model was never
    // shown it), and so is the judged whole run's own save, the supervisor's (t597).
    const stored = await run.record();
    expect(stored.lastingActs).toEqual([
      { recordedAt: expect.any(Number), act: "act-1", owner: { role: "builder", briefId: expect.any(String) }, consequences: ["create_new"], description: "act-1: trial step 3 \"save the recipe\"", undoable: true },
      { recordedAt: expect.any(Number), act: "act-2", owner: { role: "builder", briefId: expect.any(String) }, consequences: ["create_new"], description: "act-2: press button", undoable: true },
      { recordedAt: expect.any(Number), act: "act-3", owner: { role: "supervisor" }, consequences: ["create_new"], description: "act-3: trial step 4 \"save the recipe\"", undoable: true }
    ]);
  });

  // t594 fix 8 was dormant until the dispatcher's scope carried each part's lasting acts (t597, `project-agents/dispatch/scope.ts`).
  it("refuses a builder's subflow that declares no lasting act its part asks for, through the real dispatch, and accepts it declared", async () => {
    const run = await recipeBuild({ undeclaredFirst: true });
    const result = await run.build();
    if (result.status !== "proposed") throw new Error(`expected a proposal, got ${JSON.stringify(result)}`);

    const refused = run.builderSaw.find((entry) => entry.callId === "submit.undeclared")!.value as JsonObject;
    expect(refused).toMatchObject({ ok: false });
    expect(JSON.stringify(refused)).toContain("subflow.lasting_act_missing");
    expect(JSON.stringify(refused)).toContain("ask for a lasting act (create_new)");
    // Nothing of the refused one was kept: the accepted revision is the declared one, and it is the one tried.
    const accepted = run.builderSaw.find((entry) => entry.callId === "submit")!.value as JsonObject;
    expect(accepted).toMatchObject({ ok: true });
    expect(accepted.script).toContain("consequences: create_new");
    expect(run.builderSaw.find((entry) => entry.toolId === "core.test_subflow")!.value).toMatchObject({ verdict: "yes", revision: accepted.revision });
  });

  // A failed build's chat said nothing of what the supervisor's ending names still on the target (t586, t590).
  it("tells the person, when it ends with the save still in the box, what is still on the target in Core's words, its failure code its own", async () => {
    const run = await recipeBuild({ ends: true });
    const seen: ClientGatewayActivity[] = [];
    const unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
    const failure = await run.build().then(() => undefined, (error: unknown) => error).finally(unsubscribe);
    const diagnostic = parseAutomationStudioFlowBootstrapGenerationError(failure);
    const reason = ((await run.record()).ending as JsonObject).reason as string;
    expect(reason.startsWith(`${ENDED_REASON} Still on the target from this build: `)).toBe(true);
    const note = reason.slice(ENDED_REASON.length + 1);
    expect(diagnostic).toMatchObject({ code: "flow_bootstrap.post_provider_validation_failed", issueCodes: ["project.build_blocked"] });
    expect(note.startsWith("Still on the target from this build: ")).toBe(true);
    const told = seen.find((event) => event.detail?.title === "FluxIQ could not finish the Flow.");
    // Why it ended, the supervisor's words screened, then what is left once, in a person's words (t649, t567 lane 4); the ledger's note stays in the record.
    expect(told?.detail).toMatchObject({ kind: "note", status: "failed" });
    const text = (told?.detail as { text: string }).text;
    // Core's record of its tests goes between the reason and what is left (t738, `../../project-build-ending/record-told.ts`).
    // No read showed the save's change, so it is told as acts to check, never as no act at all (t738, `left-on-target.ts` `seen`).
    // Why is the chat's ending's to say (`endedBecause`), so the row says it no second time (t741 B5).
    expect(diagnostic!.endedBecause).toBe(ENDED_REASON);
    expect(text).toBe(`Both parts tested on their own passed their own test. No whole Flow was assembled, so it was never tested as one. The build left no change on the site that it knows of. It used “save the recipe” and made 1 press it could not name, but no read ever showed a change from them, so they may have changed nothing; check them if you need the site exactly as it was.`);
    expect(text).not.toContain("on the target");
    // Its trial's recipe and its explored one, both still there.
    expect([...run.box]).toEqual(["recipe:lentil-soup", TRIAL_RECIPE, "recipe:herb-bread"]);
  });

  it("undoes a cart line a builder's press on an item-less control added, and keeps the line that was there before", async () => {
    const run = await cartBuild();
    const result = await run.build();
    if (result.status !== "proposed") throw new Error(`expected a proposal, got ${JSON.stringify(result)}`);

    // The builder's own trial of its add (t597), and its add.
    expect(lastOf(run.supervisorSaw[5]!, "core.test_candidate")).toMatchObject({ ok: false, code: "project.trial_reset_required", actsInPlace: [{ act: "act-1", did: "trial step 3 \"add it to the cart\"" }, { act: "act-2", did: "press \"Add to cart\" button" }] });
    expect(lastOf(run.supervisorSaw[6]!, "project.dispatch")).toMatchObject({ ok: true, returns: [{ outcome: "done" }], lastingActsInPlace: 0 });
    // Done, and honest: the trial's add it named under cannotUndo stays, so it never says every act is undone (t684).
    const said = ((lastOf(run.supervisorSaw[6]!, "project.dispatch")!.returns as JsonObject[])[0]!.reason as string);
    expect(said).not.toContain("Every lasting act this build made is undone");
    // Named in a person's words, never by its ledger id (t738, `../../../project-agents/dispatch/reset-done.ts`).
    // Kept, it is of a reversible class: said as not undone, never as beyond the site (t741 B5) -- the line was in fact removed.
    expect(said).toContain("1 act of this build could not be undone, so it may still be on the site: used “add it to the cart”.");
    expect(said).not.toContain("site offers no way");
    // The add, then the removal of the very line it created; the domain never saw `undoes`.
    expect(run.acted).toEqual(["add herb-tea", "remove herb-tea"]);
    expect(run.inputs.every((value) => !Object.prototype.hasOwnProperty.call(value, "undoes"))).toBe(true);
    expect(run.cart).toEqual(["dish-soap"]);
    expect(run.cartWhenWholeJudged).toEqual([["dish-soap"], ["dish-soap"]]);
    // From its first decision the reset was told its task, not the person's: the act, how it was done, and its page.
    const task = run.resetFirstInstructions();
    expect(task).toContain("This brief is a reset, not a build");
    expect(task).toContain("act-2: ");
    expect(task).toContain(`made on the page ${PRODUCT_PAGE}`);
    expect(task).not.toContain(TASK);
    const stored = await run.record();
    expect(stored.lastingActs).toMatchObject([
      { act: "act-1", owner: { role: "builder" }, consequences: ["create_new"], undoable: true },
      { act: "act-2", owner: { role: "builder" }, consequences: ["create_new"], undoable: true },
      { act: "act-3", owner: { role: "supervisor" }, consequences: ["create_new"], undoable: true }
    ]);
  });
});

const PRODUCT_PAGE = "https://shop.test/product/herb-tea";
const ADD = "domain.example.add-to-cart";
const REMOVE = "domain.example.remove-line";
const GO = "domain.example.go";

function shopNode(id: string, label: string, parameters: AutomationStudioNodeDefinition["parameters"], domainId = "example", packageId = "example.shop"): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1", id, version: "1.0.0", label, description: `${label} in the shop.`, category: "action",
    source: { kind: "importer", domainId, packageId, implementationKey: id },
    availability: { kind: "domain", domainId }, requiredRuntimeCapabilities: [`${domainId}.actions`], capabilities: { executable: true, codeBacked: true },
    inputs: [{ id: "in", label: "In", valueType: "any", required: false }], outputs: [{ id: "success", label: "Success", valueType: "any" }], parameters,
    outputAction: { fixedOutputId: id }
  };
}

/** The recipe site's Save, as a Flow's run presses it: it puts its recipe in the box (header, t598). */
function recipeRuntime(box: Set<string>, pressed: string[]) {
  const nodes = [shopNode(SAVE, "Save recipe", [{ id: "recipe", label: "Recipe", valueType: "string", required: true }], "isolated", "isolated.recipes")];
  return new AutomationStudioNativeNodeRuntime({ permissions: [], runtimeCapabilities: ["isolated.actions"] }).register(
    { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "isolated.recipes", packageVersion: "1.0.0", domainId: "isolated", nodes },
    { packageId: "isolated.recipes", packageVersion: "1.0.0", implementations: { [SAVE]: ({ parameters }: { parameters: Readonly<Record<string, unknown>> }) => {
      box.add(String(parameters.recipe));
      pressed.push(`run Save ${String(parameters.recipe)}`);
      return { status: "success" as const, route: "success", outputs: { success: true } };
    } } }
  );
}

/**
 * The recipe site's host runtime: a snapshot of the box around each step a run takes, and the diff of the two, which
 * lists the recipes -- each by its own item token -- the box showed before and after the step (header, t598).
 */
function boxDiffs(box: Set<string>): AutomationStudioHostRuntimeBoundary {
  let captured = 0;
  const shown = (ref: AutomationStudioHostStateSnapshotRef | undefined) => (Array.isArray(ref?.summary?.box) ? ref.summary.box : []) as string[];
  return {
    capabilities: [],
    captureStateSnapshot: ({ attemptId, point }) => {
      captured += 1;
      return { stateSnapshotId: `box.${captured}`, stateRef: `box.${captured}@${attemptId}:${point}`, capturedAt: captured, summary: { box: [...box] } };
    },
    inspectStateDiff: ({ before, after }) => {
      const was = shown(before), now = shown(after);
      return { documentChanged: false, added: now.filter((item) => !was.includes(item)).join("\n"), removed: was.filter((item) => !now.includes(item)).join("\n"), items: { before: was, after: now } };
    }
  };
}

function shopRuntime() {
  const nodes = [
    shopNode(ADD, "Add to cart", []),
    shopNode(REMOVE, "Remove cart line", [{ id: "line", label: "Line", valueType: "string", required: true }]),
    shopNode(GO, "Go to page", [{ id: "to", label: "To", valueType: "string", required: true }])
  ];
  return new AutomationStudioNativeNodeRuntime({ permissions: [], runtimeCapabilities: ["example.actions"] }).register(
    { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "example.shop", packageVersion: "1.0.0", domainId: "example", nodes },
    { packageId: "example.shop", packageVersion: "1.0.0", implementations: Object.fromEntries(nodes.map((definition) => [definition.id, () => ({ status: "success", route: "success", outputs: { success: true } })])) }
  );
}

/**
 * A product page with the cart drawer open: the drawer lists the cart's lines,
 * each by its own item token. "Add to cart" sits in no item; each line's
 * Remove sits in its line. Every lasting press is put to the gate first.
 */
function shopDomain(cart: string[]) {
  const inputs: JsonObject[] = [];
  const acted: string[] = [];
  const read = () => ({ lines: cart.map((line) => `line ${line}`), items: cart.map((line) => `line:${line}`) });
  const binding: AutomationStudioLlmEvidenceRuntimeBinding = {
    domainId: "example",
    deniedEvidenceKeys: [],
    tools: [{ toolId: "shop.look", description: "Look at the page.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } }],
    runsNodes: { arrival: { node: GO, parameter: "to" } },
    resolvePlanNodeParameters: automationStudioTestDeclaredStepResolution,
    startState: async (input: { start?: JsonObject }) => {
      const now = read();
      const was = Array.isArray(input.start?.lines) ? (input.start!.lines as string[]) : undefined;
      const gone = was ? was.filter((line) => !now.lines.includes(line)) : [];
      const added = was ? now.lines.filter((line) => !was.includes(line)) : [];
      return { state: { lines: now.lines }, differs: [...gone.map((line) => `gone: ${line}`), ...added.map((line) => `new: ${line}`)], location: PRODUCT_PAGE, lines: { gone, added }, items: now.items };
    },
    executeTool: async ({ toolId, value, permission }) => {
      inputs.push(structuredClone(value));
      if (toolId === "shop.look") return { kind: "llm_evidence_tool_execution", evidence: { page: "Herb tea", cart: [...cart], controls: ["Add to cart", "Remove"] }, effectApplied: false };
      const parameters = (value.parameters ?? {}) as JsonObject;
      if (value.node === GO) return { kind: "llm_evidence_tool_execution", evidence: { ok: true, at: String(parameters.to) }, effectApplied: true };
      const line = typeof parameters.line === "string" ? parameters.line : undefined;
      const consequences = (Array.isArray(value.consequences) ? value.consequences : []) as AutomationStudioActionConsequence[];
      const declaration: AutomationStudioActionDeclaration = { consequences, control: { name: value.node === ADD ? "Add to cart" : "Remove", kind: "button", ...(line ? { item: `line:${line}` } : {}) }, verb: "press", effect: "mutate" };
      const verdict = await permission!(declaration);
      if (!verdict.permitted) return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "permission_required" }, effectApplied: false };
      if (value.node === ADD) {
        cart.push("herb-tea");
        acted.push("add herb-tea");
      } else if (line) {
        cart.splice(cart.indexOf(line), 1);
        acted.push(`remove ${line}`);
      }
      return { kind: "llm_evidence_tool_execution", evidence: { ok: true, cart: [...cart] }, effectApplied: true };
    }
  };
  return { binding, inputs, acted };
}

/** One decision of the reset agent: its decisions so far (this one counted), and what it sees. */
type ResetScript = (n: number, evidence: readonly Entry[]) => JsonObject;

/** The reset agent of the cases above: remove the line the build added, naming its act, then complete. */
const UNDO_THE_ADD: ResetScript = (n) => n === 1
  ? { kind: "tool_call", callId: "undo.add", toolId: "core.run_node", input: { node: REMOVE, parameters: { line: "herb-tea" }, consequences: ["delete"], undoes: "act-2" } }
  // act-1 is the builder's own trial of its add, which names no cart line, so no control here takes it back (t597).
  : { kind: "complete", result: { summary: "The line this build added is out of the cart again.", cannotUndo: ["act-1"] } };

/** A reset agent's request: no supervisor's tools, and the reset's completion, a summary with no subflow key. */
function isResetRequest(request: AutomationStudioLlmTaskRequest): boolean {
  const loop = request.context.evidenceLoop;
  const properties = (loop?.completionSchema.properties ?? {}) as JsonObject;
  return !loop?.tools.some((tool) => tool.toolId === "project.write_plan") && properties.summary !== undefined && properties.subflowKey === undefined;
}

/**
 * `scripted` with every model decision sent through the real DeepSeek adapter first, as a live build's is: its pre-send
 * checks run on the request exactly as built, and only a request they pass reaches the wire, where the scripted reply
 * answers it. The scripted provider alone never runs those checks, which is how a reset's refused first request
 * (office r1 `run-mved5pro-91998cc2`, steps 0060-0061) passed every test here. `only` narrows which decisions are sent
 * through it; `altered` changes a request before the adapter sees it, to make one it must refuse.
 */
function throughDeepSeek(scripted: AutomationStudioLlmProvider, options: { only?: (request: AutomationStudioLlmTaskRequest) => boolean; altered?: (request: AutomationStudioLlmTaskRequest) => AutomationStudioLlmTaskRequest } = {}): AutomationStudioLlmProvider {
  return {
    ...scripted,
    runTask: async (built, execution) => {
      if (built.taskKind !== "evidence_tool_decision" || options.only?.(built) === false) return await scripted.runTask(built, execution);
      const request = options.altered ? options.altered(structuredClone(built)) : built;
      const deepseek = createAutomationStudioDeepSeekProvider({
        secretReference: { kind: "secret_reference", id: "secret:deepseek" },
        resolveSecret: async () => "test-secret",
        fetchImpl: (async () => {
          const reply = await scripted.runTask(built, execution) as { response: JsonObject; usage?: { inputTokens: number; outputTokens: number; totalTokens: number } };
          return new Response(JSON.stringify({
            choices: [{ finish_reason: "stop", message: { content: JSON.stringify(reply.response) } }],
            usage: { prompt_tokens: reply.usage?.inputTokens ?? 10, completion_tokens: reply.usage?.outputTokens ?? 5, total_tokens: reply.usage?.totalTokens ?? 15 }
          }), { status: 200, headers: { "content-type": "application/json" } });
        }) as typeof fetch
      });
      return await deepseek.runTask(request, execution);
    }
  };
}

async function cartBuild(resetScript: ResetScript = UNDO_THE_ADD, options: { startLocation?: string; preflight?: true } = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-project-build-cart-"));
  /** The cart held dish soap before the build. */
  const cart = ["dish-soap"];
  const cartWhenWholeJudged: string[][] = [];
  const supervisorSaw: Record<number, readonly Entry[]> = {};
  let supervisorDecisions = 0;
  /** The instructions of the reset agent's first request. */
  let resetFirst: string | undefined;
  let resetDecisions = 0;
  /** What the reset agent was offered and saw, at its latest request. */
  const resetSaw: { tools: Array<{ toolId: string; inputSchema: JsonObject }>; completion: JsonObject; evidence: Entry[] } = { tools: [], completion: {}, evidence: [] };
  /** The builder's run-node tool, as it was offered. */
  let builderRunNode: JsonObject | undefined;
  /** Every request the reset agent was sent, as built. */
  const resetRequests: AutomationStudioLlmTaskRequest[] = [];
  const scripted = mockProvider(async (request) => {
    if (request.metadata?.source === "instructionAuthority") return decision({ kind: "tool_call", callId: "read", toolId: "none", input: {} });
    if (request.taskKind === "loop_verification") {
      if (!JSON.stringify(request.context).includes("This trial ran only the subflow")) cartWhenWholeJudged.push([...cart]);
      return judgeReply("yes");
    }
    const loop = request.context.evidenceLoop!;
    const evidence = loop.evidence as Entry[];
    const tools = loop.tools.map((tool) => tool.toolId);
    if (tools.includes("project.write_plan")) {
      supervisorDecisions += 1;
      supervisorSaw[supervisorDecisions] = evidence.map((entry) => ({ ...entry }));
      return decision(supervisorDecision(supervisorDecisions, evidence));
    }
    const properties = (loop.completionSchema.properties ?? {}) as JsonObject;
    const ranNode = lastOf(evidence, "core.run_node");
    if (properties.summary !== undefined && properties.subflowKey === undefined) {
      resetFirst ??= JSON.stringify(request.context.instructions);
      resetRequests.push(structuredClone(request));
      resetDecisions += 1;
      Object.assign(resetSaw, { tools: structuredClone(loop.tools), completion: structuredClone(loop.completionSchema), evidence: evidence.map((entry) => structuredClone(entry)) });
      return decision(resetScript(resetDecisions, evidence));
    }
    builderRunNode ??= structuredClone(loop.tools.find((tool) => tool.toolId === "core.run_node")?.inputSchema) as JsonObject | undefined;
    const subflowKey = (properties.subflowKey as JsonObject | undefined)?.const as string;
    const submitted = lastOf(evidence, "core.submit_subflow");
    const tested = lastOf(evidence, "core.test_subflow");
    // The subflow that acts on nothing (header).
    if (subflowKey === "prepare") return decision(prepareDecision(submitted, tested));
    if (submitted?.ok !== true) return decision({ kind: "tool_call", callId: "submit", toolId: "core.submit_subflow", input: CART_SUBMISSION });
    if (tested?.verdict !== "yes") return decision({ kind: "tool_call", callId: "test", toolId: "core.test_subflow", input: { revision: submitted.revision as number, digest: submitted.digest as string } });
    // After its own passing trial, as in the case above (t578).
    if (!ranNode) return decision({ kind: "tool_call", callId: "add", toolId: "core.run_node", input: { node: ADD, parameters: {}, consequences: ["create_new"] } });
    return decision({ kind: "complete", result: { subflowKey, revision: submitted.revision as number, digest: submitted.digest as string } });
  });
  const provider = options.preflight ? throughDeepSeek(scripted) : scripted;
  const domain = shopDomain(cart);
  const service = new AutomationStudioService({ dataDir, llmProviderResolver: () => ({ provider, maxCallsPerRun: 80, maxEstimatedCostUsd: 0.1 }), llmEvidenceRuntime: domain.binding });
  service.bindNativeNodeRuntime(shopRuntime());
  const builds = automationStudioTestSettledBuilds(service, dataDir);
  cleanups.push(builds.cleanup);
  const { project, flow } = await blankFixture(service, "active", "example");
  return {
    cart, cartWhenWholeJudged, supervisorSaw, acted: domain.acted, inputs: domain.inputs, record: () => storedRecord(dataDir), resetFirstInstructions: () => resetFirst ?? "", resetSaw, resetRequests, builderRunNode: () => builderRunNode,
    build: () => builds.track(project.id, flow.flowId, service.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, caller: caller(), evidenceGuided: true, authoringMode: "project", ...(options.startLocation ? { startLocation: options.startLocation } : {}) }))
  };
}

// t593, A8 bigbox `run-mv8c7unr-42a8456d`: the whole trial never went to the build's start location. A build told where it
// starts assembles a Flow whose router-run subflow opens with the arrival, after its Start, so the whole trial -- and a run of
// the saved Flow on its own -- loads the start location first, and the whole trial says so.
describe("a project build told where it starts", () => {
  it("assembles a Flow that loads the start location first, and its whole trial says it did", async () => {
    const start = "https://shop.test/";
    const run = await cartBuild(UNDO_THE_ADD, { startLocation: start });
    const result = await run.build();
    if (result.status !== "proposed") throw new Error(`expected a proposal, got ${JSON.stringify(result)}`);
    const judged = lastOf(run.supervisorSaw[7]!, "core.test_candidate")!;
    expect(judged).toMatchObject({ verdict: "yes" });
    const feedback = judged.feedback as JsonObject;
    // The first step after the Start is the arrival, to the start location.
    const steps = (feedback.steps as JsonObject[]).filter((step) => step.definitionId !== "builtin.control.start");
    expect(steps[0]).toMatchObject({ definitionId: GO, status: "succeeded" });
    expect(feedback.phaseStart).toMatchObject({ phase: "whole_trial", startHook: "none", arrival: "loaded", standsOn: `the build's start location (${start})` });
    // The reset's own start told it what was still on the site.
    expect(run.resetSaw.evidence[0]?.value).toMatchObject({ phaseStart: { phase: "reset", startHook: "none", stillOnSite: [{ act: "act-1" }, { act: "act-2" }] } });
  });
});

// A reset is a reset in every word it is shown (t591, social debug fixes 2-4).
// Its run-node tool offers `undoes` and no `write`. A lasting press of its own
// that names no act runs, and is told as outside the reset; an act the site
// offers no control to reverse is named under `cannotUndo` once the reset was
// asked for it, and the reset comes back done with that act kept. An undo aimed
// at another item's control is refused in the reset's words, never "test
// again".
describe("a reset brief", () => {
  it("offers undoes and no write, tells its own lasting press as outside it, and ends done with the acts it names under cannotUndo kept", async () => {
    const kept = vi.spyOn(AutomationStudioSiteResetLedger.prototype, "beforeTrial");
    cleanups.push(async () => kept.mockRestore());
    const run = await cartBuild((n) => {
      if (n === 1) return { kind: "tool_call", callId: "extra.add", toolId: "core.run_node", input: { node: ADD, parameters: {}, consequences: ["create_new"] } };
      if (n === 2) return { kind: "complete", result: { summary: "Nothing here can be undone." } };
      return { kind: "complete", result: { summary: "The site offers no control that takes these back.", cannotUndo: ["act-1", "act-2"] } };
    });
    await run.build().catch(() => undefined);

    // Its run-node tool: undoes, and no write; the builder's still had write.
    const runNode = run.resetSaw.tools.find((tool) => tool.toolId === "core.run_node")!.inputSchema.properties as JsonObject;
    expect(runNode).toHaveProperty("undoes");
    expect(runNode).not.toHaveProperty("write");
    expect((run.builderRunNode()!.properties as JsonObject)).toHaveProperty("write");
    expect((run.resetSaw.completion.properties as JsonObject)).toHaveProperty("cannotUndo");

    // Its own add ran, as no gate asks about creating, and was told as outside the reset.
    expect(run.acted).toEqual(["add herb-tea", "add herb-tea"]);
    const extra = run.resetSaw.evidence.find((entry) => entry.callId === "extra.add")!.value as JsonObject;
    expect(extra).toMatchObject({ ok: true, outsideBrief: { consequences: ["create_new"] } });
    expect((extra.outsideBrief as JsonObject).note).toContain("outside this reset");
    expect((extra.outsideBrief as JsonObject).note).not.toContain("subflow");

    // Its first completion was refused with both acts; the second named them under cannotUndo, which reached the ledgers, and it came back done.
    expect(JSON.stringify(run.resetSaw.evidence)).toContain("project.reset_acts_in_place");
    expect(kept.mock.calls.some((call) => JSON.stringify(call[1]) === JSON.stringify(["act-1", "act-2"]))).toBe(true);
    expect(lastOf(run.supervisorSaw[6]!, "project.dispatch")).toMatchObject({ ok: true, returns: [{ outcome: "done" }], lastingActsInPlace: 0 });
    // Kept, not undone: both lines are still in the cart.
    expect(run.cart.filter((line) => line === "herb-tea")).toHaveLength(2);
  });

  it("refuses an undo aimed at another item in a reset's words: undo another act or name it under cannotUndo, never test again", async () => {
    const run = await cartBuild((n) => n === 1
      ? { kind: "tool_call", callId: "undo.wrong", toolId: "core.run_node", input: { node: REMOVE, parameters: { line: "dish-soap" }, consequences: ["delete"], undoes: "act-2" } }
      // act-1 is named honestly: no act is kept for having been asked for twice (F1 continuation), and act-2 is kept by
      // its refused undo alone.
      : { kind: "complete", result: { summary: "The act this build made cannot be undone here.", cannotUndo: ["act-1"] } });
    await run.build().catch(() => undefined);

    const refused = run.resetSaw.evidence.find((entry) => entry.callId === "undo.wrong")!.value as JsonObject;
    // act-2 is the builder's add (act-1 its trial of it, t597): the dish soap's line is not its own.
    expect(refused).toMatchObject({ ok: false, code: "candidate.undo_wrong_target", act: "act-2" });
    expect(refused.instruction).toBe(AUTOMATION_STUDIO_SITE_RESET_WORDS.wrongTarget("reset"));
    expect(refused).not.toHaveProperty("outsideBrief");
    // The dish soap the cart held before the build was never touched.
    expect(run.acted).toEqual(["add herb-tea"]);
    expect(run.cart).toEqual(["dish-soap", "herb-tea"]);
    expect(lastOf(run.supervisorSaw[6]!, "project.dispatch")).toMatchObject({ ok: true, returns: [{ outcome: "done" }], lastingActsInPlace: 0 });
  });
});

// F3, office r1 `run-mved5pro-91998cc2` 0060-0061: a reset dispatched after a builder's evidence loop was refused
// `llm.provider_evidence_loop_context_invalid` at its first decision, before any provider call. The reset's decision
// schema was built from the reset loop's completion schema, and its request carried the reset ports' copy of it, whose
// `cannotUndo` description had been reworded alone; the pre-send check rebuilds the decision schema from the completion
// schema the request carries, so the two never matched.
describe("a reset brief's requests through DeepSeek's own pre-send checks", () => {
  it("pass from its first decision, and one whose completion schema is not its decision schema's still refuses", async () => {
    const run = await cartBuild(UNDO_THE_ADD, { preflight: true });
    const result = await run.build();
    if (result.status !== "proposed") throw new Error(`expected a proposal, got ${JSON.stringify(result)}`);
    expect(run.resetRequests).toHaveLength(2);
    expect(lastOf(run.supervisorSaw[6]!, "project.dispatch")).toMatchObject({ ok: true, returns: [{ outcome: "done" }], lastingActsInPlace: 0 });

    // The reset's own first request, its completion schema's wording changed and nothing else: refused before the wire.
    const first = structuredClone(run.resetRequests[0]!);
    const loop = first.context.evidenceLoop!;
    const cannotUndo = (loop.completionSchema.properties as JsonObject).cannotUndo as JsonObject;
    cannotUndo.description = `${String(cannotUndo.description)} Reworded.`;
    const wire = vi.fn(async () => new Response("{}", { status: 200 }));
    const deepseek = createAutomationStudioDeepSeekProvider({ secretReference: { kind: "secret_reference", id: "secret:deepseek" }, resolveSecret: async () => "test-secret", fetchImpl: wire as unknown as typeof fetch });
    await expect(deepseek.runTask(first)).rejects.toMatchObject({ code: "llm.provider_evidence_loop_context_invalid" });
    expect(wire).not.toHaveBeenCalled();
  });

  // In office r1 the refused reset came back blocked and the supervisor then ended blocked; the build's
  // `flow_bootstrap.post_provider_validation_failed` was that recorded ending (`project.build_blocked`), not the refusal
  // thrown on. This holds that path for a reset whose request is genuinely invalid.
  it("end through the supervisor's honest ending when a reset's first request is refused before any call, naming the refusal", async () => {
    const run = await recipeBuild({
      ends: true,
      resetSentAs: (request) => {
        const cannotUndo = (request.context.evidenceLoop!.completionSchema.properties as JsonObject).cannotUndo as JsonObject;
        cannotUndo.description = `${String(cannotUndo.description)} Reworded.`;
        return request;
      }
    });
    const seen: ClientGatewayActivity[] = [];
    const unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
    const failure = await run.build().then(() => undefined, (error: unknown) => error).finally(unsubscribe);

    // The reset came back blocked under the refusal's code, and the supervisor went on to end.
    const reset = lastOf(run.supervisorSaw[4]!, "project.dispatch")!;
    expect(reset).toMatchObject({ ok: true, returns: [{ kind: "reset", outcome: "blocked" }] });
    expect(String((reset.returns as JsonObject[])[0]!.reason)).toContain("flow_bootstrap.provider_evidence_loop_context_invalid");
    // The build fails as every honest blocked ending does: the supervisor's recorded ending, told to the person.
    expect(parseAutomationStudioFlowBootstrapGenerationError(failure)).toMatchObject({ code: "flow_bootstrap.post_provider_validation_failed", issueCodes: ["project.build_blocked"] });
    expect(((await run.record()).ending as JsonObject).outcome).toBe("blocked");
    expect(seen.some((event) => event.detail?.title === "FluxIQ could not finish the Flow.")).toBe(true);
  });
});


it("whole-trial collection authority comes from original builder routing, never late reads or another resource", async () => {
  for (const kind of ["original", "late", "other-resource", "malformed"] as const) {
    const project = new AutomationStudioSiteResetProjectLedger();
    project.forBrief("supervisor");
    const collection = (scope: string, subjects: string[], other = false) => ({ scope: `${other ? "other:" : ""}${scope}`, group: other ? "g:other" : "g:page", subjects, states: Object.fromEntries(subjects.map((subject) => [subject, `v:${subject}`])) });
    const original = [collection("p:active", ["s:existing", "s:baseline"]), collection("p:saved", ["s:archived"])];
    const other = kind === "other-resource";
    const beforeMove = [collection("p:active", ["s:existing", "s:baseline", "s:new"], other), collection("p:saved", ["s:archived"], other)];
    const moved = [collection("p:active", ["s:baseline", "s:new"], other), collection("p:saved", ["s:existing", "s:archived"], other)];
    const witnessedAfter = structuredClone(moved);
    if (kind === "malformed") delete witnessedAfter[1]!.states["s:existing"];
    const trialActs = [
      { step: 1, definitionId: "demo.add", consequences: ["create_new" as const], spot: { subject: "s:new" } },
      { step: 2, definitionId: "demo.move", consequences: ["modify_existing" as const], spot: { scope: beforeMove[0]!.scope, subject: "s:existing" }, collections: { before: beforeMove, after: witnessedAfter } }
    ];
    const mock = vi.spyOn(trialPorts, "automationStudioCandidateTrialPort").mockReturnValue({
      port: async () => ({ revision: 1, digest: "digest", verdict: "yes", feedback: {}, trialRunId: "whole.1", acts: trialActs }),
      records: () => [], spent: () => ({ calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 })
    });
    try {
      // The whole-trial owner exists BEFORE any builder observation, as in the service.
      const environment = { projectId: "project", flowId: "flow" } as Parameters<typeof automationStudioProjectBuildWholeTrials>[0]["environment"];
      const trials = automationStudioProjectBuildWholeTrials({ candidateId: "candidate", environment, binding: {} as AutomationStudioLlmEvidenceRuntimeBinding, judge: { provider: mockProvider(async () => { throw new Error("No model expected"); }), instructions: [] }, ledger: project });
      const builder = automationStudioProjectBuildResetCalls(project, project.forBrief("builder"));
      if (kind === "late") builder.explored({ callId: "prior", toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences: ["create_new"], control: { name: "Add", kind: "button" }, verb: "press" } });
      builder.observed({ state: {}, differs: [], collections: original });
      // Actual whole-trial port records acts under supervisor; no manual baseline seed.
      await trials.port({} as Parameters<typeof trials.port>[0]);
      const acts = project.snapshot().acts.filter((act) => act.owner === "supervisor");
      expect(acts).toHaveLength(2);
      const reset = automationStudioProjectBuildResetCalls(project, project.forBrief("reset"));
      reset.observed({ state: {}, differs: [], collections: moved });
      // A source notification can disappear while the whole-trial create
      // remains in its destination. Actual project routing must retain it.
      project.forBrief("supervisor").placed(acts[0]!.act, { state: {}, location: "source", changed: ["created notice"], lines: { gone: [], added: ["created notice"] } });
      expect(await project.forBrief("supervisor").beforeTrial({ compare: async () => ({ moved: false, differs: [] }), compareAt: async () => ({ moved: false, differs: [], lines: { gone: [], added: [] } }) })).toMatchObject({ kind: "refuse" });
      // Still on the site, and still refusing trials: to undo, or, with no ref a read could issue here, one no call can settle (t743).
      const supervisor = project.forBrief("supervisor");
      expect([...supervisor.inPlace(), ...supervisor.unsatisfiable()].map((act) => act.act)).toContain(acts[0]!.act);
      const addControl = { scope: moved[0]!.scope, subject: "s:new" };
      const moveControl = { scope: moved[1]!.scope, subject: "s:existing" };
      const deletion = reset.target(acts[0]!.act, { effect: "mutate", consequences: ["delete"], control: addControl });
      const inverse = reset.target(acts[1]!.act, { effect: "mutate", consequences: ["modify_existing"], control: moveControl });
      expect(deletion.kind).toBe(kind === "original" || kind === "malformed" ? "admit" : "refused");
      expect(inverse.kind).toBe(kind === "original" ? "admit" : "refused");
      if (kind !== "original") continue;
      for (const [index, consequences, control] of [[0, ["delete"], addControl], [1, ["modify_existing"], moveControl]] as const) {
        reset.explored({ callId: `undo.${index}`, toolId: "core.run_node", landed: true, undoes: acts[index]!.act, on: "subject", declared: { permitted: true, effect: "mutate", consequences: [...consequences], control: { name: "Inverse", kind: "button", ...control }, verb: "press" } });
      }
      reset.observed({ state: {}, differs: [], collections: original });
      expect(await project.forBrief("supervisor").beforeTrial(async () => ({ moved: false }))).toEqual({ kind: "admit" });
      expect(project.snapshot().acts.filter((act) => act.inPlace)).toEqual([]);
    } finally {
      mock.mockRestore();
    }
  }
});
