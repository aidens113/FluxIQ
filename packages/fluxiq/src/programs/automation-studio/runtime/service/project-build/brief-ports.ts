import type { JsonObject } from "../../../../../core/index.ts";
import { AutomationStudioNodeRegistry } from "../../../nodes/index.ts";
import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import { observeAutomationStudioEvidenceLoop } from "../../activity/index.ts";
import { automationStudioFlowBootstrapActionPermissions, automationStudioFlowBootstrapPersonNeeded, flowBootstrapEvidenceUnusableDecisionFailure, type AutomationStudioBootstrapAccounting, type AutomationStudioFlowBootstrapActionPermissions, type AutomationStudioFlowBootstrapPersonNeeded } from "../../flow-bootstrap/index.ts";
import { AUTOMATION_STUDIO_SITE_RESET_SETTLE_MS, AutomationStudioSiteResetStartCheck, automationStudioSiteResetPlacedCall, automationStudioSiteResetUndoesTool, type AutomationStudioSiteResetCalls, type AutomationStudioSiteResetNamedAct, type AutomationStudioSiteResetProjectLedger } from "../../flow-bootstrap/site-reset/index.ts";
import type { AutomationStudioSubflowTrialPort } from "../../flow-bootstrap/subflow-candidate/index.ts";
import { automationStudioLlmEvidenceIsOpeningCallId as isOpeningCall } from "../../llm/evidence-loop/index.ts";
import { AUTOMATION_STUDIO_LLM_DESCRIBE_NODES_TOOL_ID, automationStudioFlowDraftReplayClearedCode, automationStudioHarnessOptionRegistry, automationStudioLlmNodeDescriptions, type AutomationStudioLlmEvidenceLoopInput, type AutomationStudioLlmHarnessInput } from "../../llm/index.ts";
import type { AutomationStudioProjectBriefEnding, AutomationStudioProjectBriefPortFactory, AutomationStudioProjectBriefPortRequest } from "../../project-agents/index.ts";
import { startAutomationStudioBuildRouting } from "../../route-state/index.ts";
import { automationStudioCandidateStallCode } from "../candidate-failure/index.ts";
import { automationStudioFlowBootstrapUnusableDecisions, type generateAutomationStudioFlowCandidateDraft } from "../flow-bootstrap-commands/index.ts";
import type { AutomationStudioProjectBuildActsRecord } from "./acts-record.ts";
import type { AutomationStudioProjectBuildDecisions } from "./decisions.ts";
import { AutomationStudioProjectBuildPermissions } from "./permissions.ts";
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
// trials' own lasting acts it records in the brief's ledger. A reset brief's
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

type DraftInput = Parameters<typeof generateAutomationStudioFlowCandidateDraft>[0];

/** The reset loop's completion schema (`project-agents/dispatch/reset-loop.ts`), which its decisions are asked under. */
const RESET_COMPLETION: JsonObject = { type: "object", properties: { summary: { type: "string" } }, additionalProperties: false };

export function automationStudioProjectBuildBriefPorts(input: {
  project: AutomationStudioProjectBuildPorts;
  draft: DraftInput;
  decisions: AutomationStudioProjectBuildDecisions;
  /** The build's subflow trial port (`./subflow-trials.ts`). */
  subflowTrial: AutomationStudioSubflowTrialPort;
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
  return {
    builder: async (request) => {
      const built = await environment(request, request.ledger);
      const { instructionText: _instructionText, originalSource: _originalSource, signal: _signal, ...submission } = draft.submission;
      const trial: AutomationStudioSubflowTrialPort = async (trialRequest) => {
        const result = await input.subflowTrial(trialRequest);
        if (result.acts?.length) {
          request.ledger.trialRan(result.acts, result.trialRunId);
          input.acts.trialRan(result.acts, result.trialRunId);
        }
        return result;
      };
      const reader = new AutomationStudioSiteResetStartCheck({ binding, projectId, flowId, tools: built.loop.tools, executeTool: (call) => built.loop.executeTool(call), liveCheck: { settleMs: AUTOMATION_STUDIO_SITE_RESET_SETTLE_MS } });
      const loop = placing(built.loop, request.ledger, reader, { capture: true, signal: request.signal });
      return { loop, submission: { ...submission, permissionFor: built.permissions.planStep }, trial, observe: (observed) => observeAutomationStudioEvidenceLoop({ ...observed, decide: built.decide(observed.completionSchema) }), ended: built.ended };
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
