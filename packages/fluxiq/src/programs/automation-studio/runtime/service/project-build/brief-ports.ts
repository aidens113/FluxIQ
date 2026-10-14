import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowInstruction } from "../../../model/index.ts";
import { AutomationStudioNodeRegistry } from "../../../nodes/index.ts";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES, type AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import { observeAutomationStudioEvidenceLoop } from "../../activity/index.ts";
import { automationStudioFlowBootstrapActionPermissions, automationStudioFlowBootstrapPersonNeeded, flowBootstrapEvidenceUnusableDecisionFailure, type AutomationStudioBootstrapAccounting, type AutomationStudioFlowBootstrapActionPermissions, type AutomationStudioFlowBootstrapPersonNeeded } from "../../flow-bootstrap/index.ts";
import { AUTOMATION_STUDIO_SITE_RESET_SETTLE_MS, AUTOMATION_STUDIO_SITE_RESET_UNDOES_KEY, AUTOMATION_STUDIO_SITE_RESET_WORDS, AutomationStudioSiteResetStartCheck, automationStudioSiteResetPlacedCall, automationStudioSiteResetUndoesTool, type AutomationStudioSiteResetCalls, type AutomationStudioSiteResetNamedAct, type AutomationStudioSiteResetProjectLedger, type AutomationStudioSiteResetTarget, type AutomationStudioSiteResetTrialReset } from "../../flow-bootstrap/site-reset/index.ts";
import type { AutomationStudioSubflowTrialPreparingPort } from "../../flow-bootstrap/subflow-candidate/index.ts";
import { automationStudioLlmEvidenceIsOpeningCallId as isOpeningCall } from "../../llm/evidence-loop/index.ts";
import { AUTOMATION_STUDIO_LLM_DESCRIBE_NODES_TOOL_ID, AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID, AUTOMATION_STUDIO_NODE_WRITE_KEY, automationStudioFlowDraftReplayClearedCode, automationStudioHarnessOptionRegistry, automationStudioLlmNodeDescriptions, type AutomationStudioLlmEvidenceLoopInput, type AutomationStudioLlmEvidenceToolExecutionResult, type AutomationStudioLlmHarnessInput } from "../../llm/index.ts";
import type { AutomationStudioProjectBriefEnding, AutomationStudioProjectBriefPortFactory, AutomationStudioProjectBriefPortRequest } from "../../project-agents/index.ts";
import { startAutomationStudioBuildRouting } from "../../route-state/index.ts";
import { automationStudioCandidateStallCode } from "../candidate-failure/index.ts";
import { automationStudioFlowBootstrapUnusableDecisions, type generateAutomationStudioFlowCandidateDraft } from "../flow-bootstrap-commands/index.ts";
import type { AutomationStudioProjectBuildActsRecord } from "./acts-record.ts";
import type { AutomationStudioProjectBuildDecisions } from "./decisions.ts";
import type { AutomationStudioProjectBuildEntry } from "./entry-preparation.ts";
import { AutomationStudioProjectBuildPermissions } from "./permissions.ts";
import { AutomationStudioProjectBuildPhaseStart } from "./phase-start.ts";
import type { AutomationStudioProjectBuildProposals } from "./proposals.ts";
import { automationStudioProjectBuildResetCalls } from "./reset-calls.ts";
import type { AutomationStudioProjectBuildPorts } from "./types.ts";

// Each brief's surroundings (unit A5c; the dispatcher's port factory,
// `project-agents/dispatch/types.ts`), made once its lease is held. What the
// candidate build makes once for the whole build is made here per brief, from
// the same pieces and the same helpers (`service.ts`, the candidate branch):
//
// - harness options and node descriptions, so the nodes a brief was shown
//   whole are that brief's;
// - build routing, so a brief's route states are read off its own calls;
// - the permission gate, holding the brief's own ledger (or, for a reset, the
//   ledgers that own the acts it undoes, `./reset-calls.ts`), with the acts the
//   brief was permitted -- never more than the person permitted the build --
//   and person-needed under the brief's signal;
// - its decisions, under the loop's own completion schema (`./decisions.ts`).
//
// A build or repair brief also gets the build's subflow trial port, whose
// trials' own lasting acts its gate records in the brief's ledger. A reset brief's
// loop offers `undoes` on its run-node calls and completes once the project
// ledger shows nothing in place: before that answer, every ledger that still
// holds an act looks again on the act's own page (`beforeTrial`), which is the
// only check that marks an undo done (A5b report, "Not verified").
//
// Every brief's gate also answers for the build at promotion
// (`./permissions.ts`), and its endings stop the brief's loop: a plan step the
// person did not permit, or a check only a person could pass that was not
// passed, aborts the brief's `ended` signal, which the dispatcher joins to the
// loop's (`project-agents/dispatch/run-brief.ts`), and says why (t551). Every
// act a brief's gate or trial records is written into the build record as it is
// recorded (`./acts-record.ts`).
//
// **Each act is placed, as a candidate build's is** (t551;
// `flow-bootstrap/candidate/authoring-loop.ts`). A builder's call that makes a
// lasting act is read just before and just after it, in place, through the
// brief's own start check (`flow-bootstrap/site-reset/act-places.ts`): what it
// changed on its page and the items it created are kept with the act, so a
// reset can find it on that page and remove what it created, even when its
// control sat in no item (an Add to cart that adds a line). The start is read
// once, around the opening call, as there. A reset's undo is read around the
// same way, and what it did is told to the ledger that owns the act.
//
// **Every brief starts from the build's one start (t593).** Before a
// builder's, a repair's or a reset's first look, the start every phase of the
// build shares is made (`./phase-start.ts`): the deployment's start hook, the
// build's acts it took back marked undone in their ledgers, the predecessors'
// passing proposals run to the entry, and the brief told under `phaseStart`
// beside its opening look which of these ran and on what page it stands. A
// builder with no predecessors used to get none of it and explored whatever
// the last trial left (A8 bigbox `run-mv8c7unr-42a8456d`, brief-4 to brief-10),
// and a reset never had the hook run for it.
//
// **A dependent builder starts at its entry** (t580, bigbox debug fix 8).
// Before a builder whose subflow has predecessors takes its first look, their
// latest passing proposals run once (`./entry-preparation.ts`, step (d) of the
// start), the way its own trials will reach its entry, and the acts that run
// lands go into the brief's ledger. Prepared, its opening is a look where they
// left the site, never the arrival at the build's start, which would walk away
// from the entry. Either way its opening look says in plain words whether the
// entry was prepared, and why not when it was not.
//
// **A prepared entry is the builder's arrival** (t585, A8 launch 6). The
// domain counts a build arrived only once it has gone to the start location,
// and the opening look re-arms that, so on `run-mv85vjqo-4c022aec` every typed
// search a builder made on its prepared entry was refused
// `not_at_start_location`. The steps that reached the entry began at the start
// location, so where the opening tool declares an arrival, Core's opening look
// of a prepared builder carries `arrived: true` (the web domain's
// `node-run/arrival.ts` reads it on that opening id alone). An unprepared
// builder's opening is the arrival itself, as before, and a builder that never
// arrives is still refused.
//
// **Its start hook is the ledger's too** (t585, t578 follow-up). When the
// start ran the deployment's start hook, the hook put back every act of this
// build then on the site, as a trial's start does; each ledger marks those acts
// undone first (`startReset`), and a dependent's opening names them under
// `entry.absorbedByStartReset` as well as `phaseStart.putBack`, before the acts
// the preparation run landed are recorded.
//
// **A reset brief is told its task from its first decision** (t585, social
// debug root cause 2). It used to be sent the person's build instruction and
// see the acts only once a completion was refused, so both resets of
// `run-mv85xmgq-8a6a6f43` set out to build. Its harness now carries one Core
// instruction in place of the person's: undo these acts, each named with how
// it was done and the page it was made on (kept from the read around it, by
// act, for the whole build), and do nothing else.
//
// **A reset is a reset in every word it is shown** (t591, social debug fixes
// 2-4). Its `core.run_node` offers no `write`, since a reset writes no Flow.
// Its completion may name under `cannotUndo` the acts the site offers no
// control to reverse, and those reach every ledger before it looks again, so
// such an act ends the reset kept rather than stalled
// (`project-agents/dispatch/reset-loop.ts`). An undo aimed at another item's
// control is refused in a reset's words: undo another listed act, or name it
// under `cannotUndo`, never "test again", since a reset has no test. A lasting
// press of its own that names no act under `undoes` runs -- only moving money,
// deleting and sending are gated -- but it is told beside its result that it
// was outside the reset, as a builder is told of a press outside its brief.
//
// **The brief's permitted acts narrow only what a person is asked about**
// (t580). `permittedActs` filters the build's permitted consequences, so a
// brief whose parts ask for no lasting act puts every press that declares
// moving money, deleting, or sending to the person's gate, whatever the
// person granted the build. Creating and modifying are asked of nobody
// (`action-permissions/destructive.ts`, the user's rule of 2026-09-30) and no
// press is refused beforehand (the user's rule of 2026-10-01), so such a press
// outside the brief runs; the model is then told, beside its result, that the
// act was outside its brief and stays on the site until a reset undoes it.
//
// **A builder's trial puts the site back first** (t578; user, 2026-10-12). Its
// subflow trial gate is handed the build's one reset over the project ledger
// (`flow-bootstrap/site-reset/project-reset.ts`, through `./phase-start.ts`):
// every lasting act this build made, whichever brief
// made it, is undone before the trial, never what was there before the build.
// The gate runs the deployment's start hook first when the port has one
// (`prepareStart`, kept through every wrapper), and the trial's own acts go
// into the brief's ledger there, once, then into the build record. So a
// builder can carry out an undo without a hook, its run-node calls offer
// `undoes`, as a candidate build's do, and its gate routes each undo to the
// ledger that owns the act (`./reset-calls.ts`), as a reset brief's does.
// A builder's reader keeps the start it saw at its opening; that is the
// build's start only when nothing of the build was on the site then. A builder
// that opened after another's act, or on its prepared entry, never compares
// the whole start against it -- after the undo, that start would differ by the
// very acts undone, and the model would be asked to put them back -- so its
// reset judges each act on the act's own page alone, as the ledger does
// without a start (`flow-bootstrap/site-reset/trial-policy.ts`).
//
// The proposals a dependent builder's entry runs are the build's one registry,
// the one its subflow trials record into (`./subflow-trials.ts`).

type DraftInput = Parameters<typeof generateAutomationStudioFlowCandidateDraft>[0];

/** The reset loop's completion schema (`project-agents/dispatch/reset-loop.ts`), which its decisions are asked under. */
const RESET_COMPLETION: JsonObject = {
  type: "object",
  properties: {
    summary: { type: "string" },
    cannotUndo: {
      type: "array",
      uniqueItems: true,
      items: { type: "string", pattern: "^act-[1-9][0-9]{0,3}$" },
      description: "Only the listed acts the site offers no control to reverse, after you looked for one on the item each acted on: each is then kept, trials run with it already done, and the judge is told. Never an act you could undo."
    }
  },
  additionalProperties: false
};

export function automationStudioProjectBuildBriefPorts(input: {
  project: AutomationStudioProjectBuildPorts;
  draft: DraftInput;
  decisions: AutomationStudioProjectBuildDecisions;
  /** The build's subflow trial port (`./subflow-trials.ts`). */
  subflowTrial: AutomationStudioSubflowTrialPreparingPort;
  /** The build's proposals, which that port records every trial's verdict into. */
  proposals: AutomationStudioProjectBuildProposals;
  accounting(): AutomationStudioBootstrapAccounting;
  /** Writes the project ledger's acts into the build record as they are recorded. */
  acts: AutomationStudioProjectBuildActsRecord;
}): AutomationStudioProjectBriefPortFactory {
  const { project, draft } = input;
  const { projectId, flowId, resolution, startLocation } = draft.submission;
  const { binding } = project;
  const unusable = (maxIterations: number) => automationStudioFlowBootstrapUnusableDecisions({
    maxConsecutiveUnusableDecisions: draft.maxConsecutiveUnusableDecisions, maxIterations, callerEnding: () => undefined,
    stalled: (progress) => flowBootstrapEvidenceUnusableDecisionFailure(progress, input.accounting(), automationStudioCandidateStallCode(progress.issueCodes))
  });
  /** Where each act of the build was made, by act id: the page its read around it found (header). */
  const pages = new Map<string, string>();
  const environment = async (request: AutomationStudioProjectBriefPortRequest, siteReset: AutomationStudioSiteResetCalls, task?: () => AutomationStudioFlowInstruction[]) => {
    const registry = draft.submission.registry ?? new AutomationStudioNodeRegistry();
    const nodeDescriptions = automationStudioLlmNodeDescriptions({ registry, resolution });
    const harness = automationStudioHarnessOptionRegistry({ binding, nodeIds: registry.list(resolution).map((definition) => definition.id), startLocation, nodeDescriptions }).evidenceLoopBinding({ projectId, flowId }, { ...resolution, allowSideEffectsWithoutPolicy: true });
    const routing = await startAutomationStudioBuildRouting({ hostRuntime: project.hostRuntime, projectId, flowId, flowInputs: project.flowInputs, start: "first_look", pageless: [AUTOMATION_STUDIO_LLM_DESCRIBE_NODES_TOOL_ID] });
    const permittedActs: readonly string[] = request.brief.permittedActs;
    const permittedConsequences = (project.permissions.permittedConsequences ?? []).filter((consequence) => permittedActs.includes(consequence)) as AutomationStudioActionConsequence[];
    const permissions = automationStudioFlowBootstrapActionPermissions({ ...project.permissions, permittedConsequences, siteReset: input.acts.calls(siteReset), executeTool: project.cancellation.tool(harness.executeTool) });
    AutomationStudioProjectBuildPermissions.of(project).add(permissions);
    const personNeeded = automationStudioFlowBootstrapPersonNeeded({ executeTool: permissions.executeTool, tools: harness.tools, signal: AbortSignal.any([permissions.signal, request.signal]), clearedResultCode: automationStudioFlowDraftReplayClearedCode, ...(project.personAsk ? { ask: project.personAsk } : {}) });
    const denied = binding.deniedEvidenceKeys;
    const runHarness = async (call: AutomationStudioLlmHarnessInput) => {
      const shown = routing.shown(call.evidenceLoop!.evidence, denied);
      return await project.runHarness({ ...call, ...(task ? { instructions: task() } : {}), evidenceLoop: {...call.evidenceLoop!, evidence: shown.evidence.map((item) => ({ ...item })) }, flowBootstrap: { ...call.flowBootstrap!, routing: shown.context, describedNodeIds: nodeDescriptions.ids() } });
    };
    const decide = (completionSchema: JsonObject | undefined) => input.decisions.decide({ runHarness, wrapDecision: routing.observing, completionSchema });
    const { purse: _purse, signal: _signal, budget: _budget, maxIterations: _maxIterations, tools: _tools, executeTool: _executeTool, nodeOf: _nodeOf, ...limits } = draft.loop;
    const loop = { ...limits, tools: harness.tools, observedStateKeys: harness.observedStateKeys, executeTool: routing.recording(personNeeded.executeTool), nodeOf: nodeDescriptions.definition, unusableDecisions: unusable(request.brief.maxIterations), decide: decide(undefined) };
    return { loop, permissions, decide, ended: briefEnding(permissions, personNeeded) };
  };
  const { proposals } = input;
  // The build's one start, which every brief takes before its first look (header).
  const phaseStart = new AutomationStudioProjectBuildPhaseStart({ environment: project.trialEnvironment, arrival: binding.runsNodes?.arrival, ledger: project.ledger, proposals });
  return {
    builder: async (request) => {
      // An undo names an act of any brief of this build, and goes to the ledger that owns it; the builder's own acts to its own (header).
      const calls = automationStudioProjectBuildResetCalls(project.ledger, request.ledger);
      const built = await environment(request, calls);
      const { instructionText: _instructionText, originalSource: _originalSource, signal: _signal, ...submission } = draft.submission;
      // The build's port as it is, `prepareStart` with it; the trial's acts are recorded once, by the gate's reset below (header).
      const trial = input.subflowTrial;
      const reader = new AutomationStudioSiteResetStartCheck({ binding, projectId, flowId, tools: built.loop.tools, executeTool: (call) => built.loop.executeTool(call), liveCheck: { settleMs: AUTOMATION_STUDIO_SITE_RESET_SETTLE_MS } });
      // Whether the start this builder's reader captures at its opening is the build's: nothing of the build on the site by then (header).
      let startIsBuilds = false;
      const buildReset = phaseStart.reset(request.ledger, (signal) => ({ compare: startIsBuilds ? () => reader.compare(signal) : async () => ({ moved: false }), compareAt: (place) => reader.compareAt(place, signal) }));
      const reset: AutomationStudioSiteResetTrialReset = {
        beforeTrial: (signal, cannotUndo, options) => buildReset.beforeTrial(signal, cannotUndo, options),
        trialRan: (acts, trialRunId) => {
          const left = buildReset.trialRan(acts, trialRunId);
          if (acts.length) input.acts.trialRan(acts, trialRunId);
          return left;
        }
      };
      // Before the first look (header): the build's one start -- the hook, the acts it took back, the predecessors run to the entry.
      const opensArriving = built.loop.tools.some((tool) => tool.initialObservation?.arrival !== undefined);
      const started = await phaseStart.explore({ phase: request.brief.kind === "repair" ? "repair" : "builder", scope: request.scope, own: request.ledger, signal: request.signal, openingArrives: opensArriving });
      const { entry } = started;
      startIsBuilds = !project.ledger.snapshot().acts.some((act) => act.inPlace);
      const placed = placing(built.loop, placedAt(calls, pages), reader, { capture: true, signal: request.signal });
      const tools = placed.tools.map((tool) => automationStudioSiteResetUndoesTool(entry.kind === "prepared" ? lookingInPlace(tool) : tool));
      // Arrived only where there is a start to arrive at: the opening tool declares an arrival (header).
      const arrived = entry.kind === "prepared" && opensArriving;
      const absorbedActs = started.record.putBack?.map((act) => act.act);
      const loop = told({ ...placed, tools }, { start: started.told, entry: entryNote(request.scope.subflowKey, entry, absorbedActs), permittedActs: request.brief.permittedActs, arrived });
      return { loop, submission: { ...submission, permissionFor: built.permissions.planStep }, trial, reset, observe: (observed) => observeAutomationStudioEvidenceLoop({ ...observed, decide: built.decide(observed.completionSchema) }), ended: built.ended };
    },
    reset: async (request) => {
      // An undo aimed at another item is refused in a reset's words (header).
      const owned = automationStudioProjectBuildResetCalls(project.ledger, request.ledger);
      const calls: typeof owned = { ...owned, target: (act, declared) => resetWorded(owned.target(act, declared)) };
      // Its task, in place of the person's instruction, with the acts as the ledger holds them at each decision (header).
      const built = await environment(request, calls, () => [resetTask({ projectId, flowId }, project.ledger, pages)]);
      // Before its first look, the build's one start (header): after the hook there is usually nothing left to undo.
      const started = await phaseStart.explore({ phase: "reset", scope: request.scope, own: request.ledger, signal: request.signal, openingArrives: built.loop.tools.some((tool) => tool.initialObservation?.arrival !== undefined) });
      const check = new AutomationStudioSiteResetStartCheck({ binding, projectId, flowId, tools: built.loop.tools, executeTool: (call) => built.loop.executeTool(call), liveCheck: { settleMs: AUTOMATION_STUDIO_SITE_RESET_SETTLE_MS } });
      // Its start is not the build's: a reset never captures one, and decides on each act's own page.
      const placed = placing(built.loop, placedAt(calls, pages), check, { capture: false, signal: request.signal });
      // Its run-node calls offer `undoes` and no `write`; a lasting press of its own is told as outside it (header).
      const tools = built.loop.tools.map((tool) => withoutWrite(automationStudioSiteResetUndoesTool(tool)));
      const loop = observeAutomationStudioEvidenceLoop({ ...told({ ...placed, tools }, { start: started.told, entry: undefined, permittedActs: request.brief.permittedActs, arrived: false, role: "reset" }), decide: built.decide(RESET_COMPLETION) });
      return { loop, remainingActs: (cannotUndo) => remainingActs(project.ledger, check, request.signal, cannotUndo), ended: built.ended };
    }
  };
}

type Execute = AutomationStudioLlmEvidenceLoopInput["executeTool"];
type PlacedLedger = Parameters<typeof automationStudioSiteResetPlacedCall>[0]["ledger"];

/** `loop` with every call that makes or undoes an act read around in place, the start read around the opening call when `capture`. */
function placing<L extends { executeTool: Execute }>(loop: L, ledger: PlacedLedger, reader: AutomationStudioSiteResetStartCheck, options: { capture: boolean; signal: AbortSignal }): L {
  const inner = loop.executeTool;
  const executeTool: Execute = async (call) => {
    const opening = isOpeningCall(call.callId);
    const signal = call.signal ?? options.signal;
    if (options.capture && !opening) await reader.capture(signal);
    const ran = opening ? await inner(call) : await automationStudioSiteResetPlacedCall({ call, ledger, reader, signal, run: () => inner(call) });
    if (options.capture && opening) await reader.capture(signal);
    return ran;
  };
  return { ...loop, executeTool };
}

/** `ledger`, with the page each act was made on kept in `pages` as the read around it places the act (header). */
function placedAt<L extends PlacedLedger>(ledger: L, pages: Map<string, string>): L {
  return { ...ledger, placed: (act, place) => {
    pages.set(act, place.location);
    ledger.placed(act, place);
  } };
}

/** What a reset brief's model is told is its task (header), in place of the person's instruction; its wording names no site. */
const RESET_TASK = [
  "This brief is a reset, not a build: write no Flow and no subflow, and carry out no part of the person's task.",
  "Your only task is to undo the lasting acts this build made, listed below, each through the site's own controls on the item it acted on, naming the act under `undoes` on the call that undoes it.",
  "Each act says how it was done and, where it was read, the page it was made on: go there to find it.",
  "Leave everything that was on the site before the build began, and do nothing else on the site.",
  "Complete with a one-sentence summary once none of the listed acts is left.",
  "If the site offers no control on an act's own item that reverses it, do not keep trying and never act on another item instead: complete and name that act under `cannotUndo`, and it is kept as done."
].join(" ");

/** A reset brief's task as one Core instruction, listing every act of the build still in place now (header). */
function resetTask(flow: { projectId: string; flowId: string }, ledger: AutomationStudioSiteResetProjectLedger, pages: ReadonlyMap<string, string>): AutomationStudioFlowInstruction {
  const acts = ledger.snapshot().acts.filter((act) => act.inPlace).map((act) => {
    const page = pages.get(act.act);
    return `- ${act.act}: ${act.did}${act.call ? ` (by the build's call ${JSON.stringify(act.call)})` : ""}${page ? `, made on the page ${page}` : ", page not read"}`;
  });
  const now = Date.now();
  return {
    schemaVersion: "0.1", instructionId: "core.project_reset_task", title: "Reset brief from Core: undo this build's lasting acts",
    body: [RESET_TASK, "", "Acts to undo:", ...(acts.length ? acts : ["(none left: complete now)"])].join("\n"),
    scope: { kind: "flow", projectId: flow.projectId, flowId: flow.flowId }, priority: Number.MIN_SAFE_INTEGER, status: "active", requirement: "required", tags: ["generation"],
    createdAt: now, updatedAt: now, metadata: { source: "core.project_reset" }
  };
}

type Tool = AutomationStudioLlmEvidenceLoopInput["tools"][number];

/** The run-node tool without `write` (header): a reset writes no Flow. Any other tool unchanged. */
function withoutWrite(tool: Tool): Tool {
  const properties = tool.inputSchema.properties;
  if (tool.toolId !== AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID || !isObject(properties) || !(AUTOMATION_STUDIO_NODE_WRITE_KEY in properties)) return tool;
  const { [AUTOMATION_STUDIO_NODE_WRITE_KEY]: _write, ...kept } = properties;
  return { ...tool, inputSchema: { ...tool.inputSchema, properties: kept } };
}

/** `target` with an undo aimed at another item refused in a reset's words (header); any other answer unchanged. */
function resetWorded(target: AutomationStudioSiteResetTarget): AutomationStudioSiteResetTarget {
  if (target.kind !== "refused" || target.evidence.code !== "candidate.undo_wrong_target") return target;
  return { ...target, evidence: { ...target.evidence, instruction: AUTOMATION_STUDIO_SITE_RESET_WORDS.wrongTarget("reset") } };
}

/** A tool whose opening is a look where the page stands, not the arrival at the build's start (header). */
function lookingInPlace(tool: Tool): Tool {
  return tool.initialObservation?.arrival ? { ...tool, initialObservation: { input: tool.initialObservation.input } } : tool;
}

/**
 * What a dependent builder's opening look says about its entry; nothing for a
 * subflow the build's start begins. `absorbed` names the acts of this build
 * the start hook put back before its predecessors ran (header).
 */
function entryNote(subflowKey: string, entry: AutomationStudioProjectBuildEntry, absorbed: readonly string[] | undefined): JsonObject | undefined {
  if (entry.kind === "start") return undefined;
  const names = entry.predecessors.map((key) => `"${key}"`).join(", ");
  const putBack = absorbed?.length ? { absorbedByStartReset: [...absorbed] } : {};
  if (entry.kind === "prepared") {
    return { prepared: true, note: `Before this first look, Core ran the passing proposals of the subflows before yours (${names}) once, in order, so the site is where your subflow "${subflowKey}" begins. Explore and build from here; what they did is already done, so do not do it again.`, ...putBack };
  }
  const why = entry.missing?.length
    ? `${entry.missing.map((key) => `"${key}"`).join(", ")} has no proposal whose trial passed yet, so Core could not run it first`
    : entry.failed
      ? `Core ran them to reach your entry, but "${entry.failed}" did not run to its end (${entry.code})`
      : `Core could not run them to reach your entry (${entry.code})`;
  return { prepared: false, code: entry.code, note: `Your subflow "${subflowKey}" begins where ${names} leave the site, but ${why}. This page is not your subflow's entry: what you see and do here may differ from what your subflow meets when it runs after them.`, ...putBack };
}

/** The key Core's opening look of a builder on its prepared entry carries, which the web domain reads as its arrival (header). */
const ARRIVED_KEY = "arrived";
/** The key beside a brief's opening look that says how its start was made (header, `./phase-start-told.ts`). */
const PHASE_START_KEY = "phaseStart";

/**
 * `loop` with Core's own words beside two results (header): the opening's,
 * saying how the brief's start was made (`phaseStart`, t593) and whether the
 * entry was prepared, and a landed call's that declared a lasting act its
 * brief's parts do not ask for. The domain's evidence is kept whole; a key is
 * added beside it, never in its place. `arrived`: the opening call is sent
 * marked as the builder's arrival. `role: "reset"`: a call that names an act
 * under `undoes` is the reset's task, never outside it, and the note speaks to
 * a reset, which writes no subflow.
 */
function told<L extends { executeTool: Execute }>(loop: L, said: { start: JsonObject | undefined; entry: JsonObject | undefined; permittedActs: readonly string[]; arrived: boolean; role?: "reset" }): L {
  const inner = loop.executeTool;
  const executeTool: Execute = async (call) => {
    const opening = isOpeningCall(call.callId);
    const ran = await inner(said.arrived && opening ? { ...call, value: { ...call.value, [ARRIVED_KEY]: true } } : call);
    if (opening && (said.start || said.entry)) {
      const started = said.start ? beside(ran, PHASE_START_KEY, said.start) : ran;
      return said.entry ? beside(started, "entry", said.entry) : started;
    }
    if (said.role === "reset" && call.value[AUTOMATION_STUDIO_SITE_RESET_UNDOES_KEY] !== undefined) return ran;
    const outside = landedOutside(call.value, ran, said.permittedActs);
    if (!outside.length) return ran;
    if (said.role === "reset") {
      return beside(ran, "outsideBrief", { consequences: outside, note: `This call declared ${outside.join(", ")} and named no act under ${AUTOMATION_STUDIO_SITE_RESET_UNDOES_KEY}, so it was outside this reset, which only undoes the build's listed acts. It ran, and it stays on the site as this build's act: where the site can undo it, it is listed with the acts to undo. Do nothing on the site but undo the listed acts, and do not do it again.` });
    }
    const asked = said.permittedActs.length ? `they ask only for ${said.permittedActs.join(", ")}` : "they ask for no lasting act";
    return beside(ran, "outsideBrief", { consequences: outside, note: `This call declared ${outside.join(", ")}, which your brief's parts do not ask for (${asked}). It ran, and it stays on the site as this build's act until a reset undoes it. Write no step of your subflow that does it, and do not do it again.` });
  };
  return { ...loop, executeTool };
}

type Ran = Awaited<ReturnType<Execute>>;

/** The lasting classes `value` declared that `permitted` leaves out, when its call landed: applied an effect and did not refuse itself. */
function landedOutside(value: JsonObject, ran: Ran, permitted: readonly string[]): string[] {
  if (!isExecution(ran) || ran.effectApplied !== true || isObject(ran.evidence) && ran.evidence.ok === false) return [];
  const declared = Array.isArray(value.consequences) ? value.consequences : [];
  return AUTOMATION_STUDIO_ACTION_CONSEQUENCES.filter((consequence) => declared.includes(consequence) && !permitted.includes(consequence));
}

/** `ran` with Core's `key` added beside its evidence: in the evidence object, or holding a non-object evidence under `evidence`. */
function beside(ran: Ran, key: string, value: JsonObject): Ran {
  if (!isExecution(ran)) return ran;
  const evidence = isObject(ran.evidence) ? { ...ran.evidence, [key]: value } : { [key]: value, evidence: ran.evidence };
  return { ...ran, evidence };
}

function isExecution(ran: Ran): ran is AutomationStudioLlmEvidenceToolExecutionResult {
  return isObject(ran) && ran.kind === "llm_evidence_tool_execution";
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * The acts still in place once every ledger holding one has kept the acts the
 * reset named under `cannotUndo` (each only once it was asked for) and looked
 * again on each other act's own page.
 */
async function remainingActs(ledger: AutomationStudioSiteResetProjectLedger, check: AutomationStudioSiteResetStartCheck, signal: AbortSignal, cannotUndo?: readonly string[]): Promise<AutomationStudioSiteResetNamedAct[]> {
  const owners = [...new Set(ledger.snapshot().acts.filter((act) => act.inPlace).map((act) => act.owner))];
  for (const owner of owners) await ledger.forBrief(owner).beforeTrial({ compare: () => check.compare(signal), compareAt: (place) => check.compareAt(place, signal) }, cannotUndo);
  return ledger.snapshot().acts.filter((act) => act.inPlace).map((act) => ({ act: act.act, did: act.did }));
}

/** The brief's own ending: its gate's plan refusal or its person-needed stop, and why, in plain words. */
function briefEnding(permissions: AutomationStudioFlowBootstrapActionPermissions, personNeeded: AutomationStudioFlowBootstrapPersonNeeded): AutomationStudioProjectBriefEnding {
  return {
    signal: AbortSignal.any([permissions.signal, personNeeded.signal]),
    reason: () => {
      const request = permissions.signal.aborted ? permissions.request() : undefined;
      if (request) {
        const control = request.control.name === null ? "a control" : `"${request.control.name}"`;
        return `A step of this subflow needs the person's permission to ${request.missing.join(", ")} on ${control}, and the person did not give it (request ${request.requestId}), so the brief stopped.`;
      }
      const intervention = personNeeded.signal.aborted ? personNeeded.endedOnIntervention() : undefined;
      if (intervention) {
        const code = intervention.diagnostic.issueCodes?.[0];
        return `The site showed a check only a person can pass, and it was not passed${code ? ` (${code})` : ""}, so the brief stopped.`;
      }
      return undefined;
    }
  };
}
