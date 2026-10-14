import type { JsonObject } from "../../../../../core/index.ts";
import { AutomationStudioNodeRegistry } from "../../../nodes/index.ts";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES, type AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import { observeAutomationStudioEvidenceLoop } from "../../activity/index.ts";
import { automationStudioFlowBootstrapActionPermissions, automationStudioFlowBootstrapPersonNeeded, flowBootstrapEvidenceUnusableDecisionFailure, type AutomationStudioBootstrapAccounting, type AutomationStudioFlowBootstrapActionPermissions, type AutomationStudioFlowBootstrapPersonNeeded } from "../../flow-bootstrap/index.ts";
import { AUTOMATION_STUDIO_SITE_RESET_SETTLE_MS, AutomationStudioSiteResetStartCheck, automationStudioSiteResetPlacedCall, automationStudioSiteResetUndoesTool, type AutomationStudioSiteResetCalls, type AutomationStudioSiteResetNamedAct, type AutomationStudioSiteResetProjectLedger, type AutomationStudioSiteResetTrialReset } from "../../flow-bootstrap/site-reset/index.ts";
import type { AutomationStudioSubflowTrialPreparingPort } from "../../flow-bootstrap/subflow-candidate/index.ts";
import { automationStudioLlmEvidenceIsOpeningCallId as isOpeningCall } from "../../llm/evidence-loop/index.ts";
import { AUTOMATION_STUDIO_LLM_DESCRIBE_NODES_TOOL_ID, automationStudioFlowDraftReplayClearedCode, automationStudioHarnessOptionRegistry, automationStudioLlmNodeDescriptions, type AutomationStudioLlmEvidenceLoopInput, type AutomationStudioLlmEvidenceToolExecutionResult, type AutomationStudioLlmHarnessInput } from "../../llm/index.ts";
import type { AutomationStudioProjectBriefEnding, AutomationStudioProjectBriefPortFactory, AutomationStudioProjectBriefPortRequest } from "../../project-agents/index.ts";
import { startAutomationStudioBuildRouting } from "../../route-state/index.ts";
import { automationStudioCandidateStallCode } from "../candidate-failure/index.ts";
import { automationStudioFlowBootstrapUnusableDecisions, type generateAutomationStudioFlowCandidateDraft } from "../flow-bootstrap-commands/index.ts";
import type { AutomationStudioProjectBuildActsRecord } from "./acts-record.ts";
import type { AutomationStudioProjectBuildDecisions } from "./decisions.ts";
import { automationStudioProjectBuildPrepareEntry, type AutomationStudioProjectBuildEntry } from "./entry-preparation.ts";
import { AutomationStudioProjectBuildPermissions } from "./permissions.ts";
import type { AutomationStudioProjectBuildProposals } from "./proposals.ts";
import { automationStudioProjectBuildResetCalls } from "./reset-calls.ts";
import { automationStudioProjectBuildTrialReset } from "./trial-reset.ts";
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
// **A dependent builder starts at its entry** (t580, bigbox debug fix 8).
// Before a builder whose subflow has predecessors takes its first look, their
// latest passing proposals run once (`./entry-preparation.ts`), the way its
// own trials will reach its entry, and the acts that run lands go into the
// brief's ledger. Prepared, its opening is a look where they left the site,
// never the arrival at the build's start, which would walk away from the
// entry. Either way its opening look says in plain words whether the entry
// was prepared, and why not when it was not.
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
// subflow trial gate is handed a reset over the project ledger
// (`./trial-reset.ts`): every lasting act this build made, whichever brief
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
const RESET_COMPLETION: JsonObject = { type: "object", properties: { summary: { type: "string" } }, additionalProperties: false };

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
  const environment = async (request: AutomationStudioProjectBriefPortRequest, siteReset: AutomationStudioSiteResetCalls) => {
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
      return await project.runHarness({ ...call, evidenceLoop: { ...call.evidenceLoop!, evidence: shown.evidence.map((item) => ({ ...item })) }, flowBootstrap: { ...call.flowBootstrap!, routing: shown.context, describedNodeIds: nodeDescriptions.ids() } });
    };
    const decide = (completionSchema: JsonObject | undefined) => input.decisions.decide({ runHarness, wrapDecision: routing.observing, completionSchema });
    const { purse: _purse, signal: _signal, budget: _budget, maxIterations: _maxIterations, tools: _tools, executeTool: _executeTool, nodeOf: _nodeOf, ...limits } = draft.loop;
    const loop = { ...limits, tools: harness.tools, observedStateKeys: harness.observedStateKeys, executeTool: routing.recording(personNeeded.executeTool), nodeOf: nodeDescriptions.definition, unusableDecisions: unusable(request.brief.maxIterations), decide: decide(undefined) };
    return { loop, permissions, decide, ended: briefEnding(permissions, personNeeded) };
  };
  const { proposals } = input;
  const arrival = binding.runsNodes?.arrival;
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
      const buildReset = automationStudioProjectBuildTrialReset({
        project: project.ledger, own: request.ledger,
        checks: (signal) => ({ compare: startIsBuilds ? () => reader.compare(signal) : async () => ({ moved: false }), compareAt: (place) => reader.compareAt(place, signal) })
      });
      const reset: AutomationStudioSiteResetTrialReset = {
        beforeTrial: (signal, cannotUndo, options) => buildReset.beforeTrial(signal, cannotUndo, options),
        trialRan: (acts, trialRunId) => {
          const left = buildReset.trialRan(acts, trialRunId);
          if (acts.length) input.acts.trialRan(acts, trialRunId);
          return left;
        }
      };
      // Before the first look (header): its predecessors' passing proposals, run once to reach its entry, from the start page.
      const entry = await automationStudioProjectBuildPrepareEntry({ scope: request.scope, proposals, environment: project.trialEnvironment, signal: request.signal, ...(arrival ? { arrival } : {}) });
      if (entry.kind !== "start" && entry.acts.length) {
        request.ledger.trialRan(entry.acts, entry.runId);
        input.acts.trialRan(entry.acts, entry.runId);
      }
      startIsBuilds = !project.ledger.snapshot().acts.some((act) => act.inPlace);
      const placed = placing(built.loop, calls, reader, { capture: true, signal: request.signal });
      const tools = placed.tools.map((tool) => automationStudioSiteResetUndoesTool(entry.kind === "prepared" ? lookingInPlace(tool) : tool));
      const loop = told({ ...placed, tools }, { entry: entryNote(request.scope.subflowKey, entry), permittedActs: request.brief.permittedActs });
      return { loop, submission: { ...submission, permissionFor: built.permissions.planStep }, trial, reset, observe: (observed) => observeAutomationStudioEvidenceLoop({ ...observed, decide: built.decide(observed.completionSchema) }), ended: built.ended };
    },
    reset: async (request) => {
      const calls = automationStudioProjectBuildResetCalls(project.ledger, request.ledger);
      const built = await environment(request, calls);
      const check = new AutomationStudioSiteResetStartCheck({ binding, projectId, flowId, tools: built.loop.tools, executeTool: (call) => built.loop.executeTool(call), liveCheck: { settleMs: AUTOMATION_STUDIO_SITE_RESET_SETTLE_MS } });
      // Its start is not the build's: a reset never captures one, and decides on each act's own page.
      const loop = observeAutomationStudioEvidenceLoop({ ...placing(built.loop, calls, check, { capture: false, signal: request.signal }), tools: built.loop.tools.map(automationStudioSiteResetUndoesTool), decide: built.decide(RESET_COMPLETION) });
      return { loop, remainingActs: () => remainingActs(project.ledger, check, request.signal), ended: built.ended };
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

type Tool = AutomationStudioLlmEvidenceLoopInput["tools"][number];

/** A tool whose opening is a look where the page stands, not the arrival at the build's start (header). */
function lookingInPlace(tool: Tool): Tool {
  return tool.initialObservation?.arrival ? { ...tool, initialObservation: { input: tool.initialObservation.input } } : tool;
}

/** What a dependent builder's opening look says about its entry; nothing for a subflow the build's start begins. */
function entryNote(subflowKey: string, entry: AutomationStudioProjectBuildEntry): JsonObject | undefined {
  if (entry.kind === "start") return undefined;
  const names = entry.predecessors.map((key) => `"${key}"`).join(", ");
  if (entry.kind === "prepared") {
    return { prepared: true, note: `Before this first look, Core ran the passing proposals of the subflows before yours (${names}) once, in order, so the site is where your subflow "${subflowKey}" begins. Explore and build from here; what they did is already done, so do not do it again.` };
  }
  const why = entry.missing?.length
    ? `${entry.missing.map((key) => `"${key}"`).join(", ")} has no proposal whose trial passed yet, so Core could not run it first`
    : entry.failed
      ? `Core ran them to reach your entry, but "${entry.failed}" did not run to its end (${entry.code})`
      : `Core could not run them to reach your entry (${entry.code})`;
  return { prepared: false, code: entry.code, note: `Your subflow "${subflowKey}" begins where ${names} leave the site, but ${why}. This page is not your subflow's entry: what you see and do here may differ from what your subflow meets when it runs after them.` };
}

/**
 * `loop` with Core's own words beside two results (header): the opening's,
 * saying whether the entry was prepared, and a landed call's that declared a
 * lasting act its brief's parts do not ask for. The domain's evidence is kept
 * whole; a key is added beside it, never in its place.
 */
function told<L extends { executeTool: Execute }>(loop: L, said: { entry: JsonObject | undefined; permittedActs: readonly string[] }): L {
  const inner = loop.executeTool;
  const executeTool: Execute = async (call) => {
    const ran = await inner(call);
    if (said.entry && isOpeningCall(call.callId)) return beside(ran, "entry", said.entry);
    const outside = landedOutside(call.value, ran, said.permittedActs);
    if (!outside.length) return ran;
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

/** The acts still in place once every ledger holding one has looked again on each act's own page. */
async function remainingActs(ledger: AutomationStudioSiteResetProjectLedger, check: AutomationStudioSiteResetStartCheck, signal: AbortSignal): Promise<AutomationStudioSiteResetNamedAct[]> {
  const owners = [...new Set(ledger.snapshot().acts.filter((act) => act.inPlace).map((act) => act.owner))];
  for (const owner of owners) await ledger.forBrief(owner).beforeTrial({ compare: () => check.compare(signal), compareAt: (place) => check.compareAt(place, signal) });
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
