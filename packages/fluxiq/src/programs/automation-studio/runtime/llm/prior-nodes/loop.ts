import type { AutomationStudioLlmEvidenceDecisionHandlerContext } from "../decision-handlers/index.ts";
import { automationStudioLlmEvidenceCanonicalJson } from "../evidence-loop-decision.ts";
import type { AutomationStudioLlmEvidenceEntry } from "../context-window.ts";
import type { AutomationStudioLlmEvidenceLoopRemaining } from "../loop-budget.ts";
import { automationStudioLlmRunNodesTool } from "../node-reruns/index.ts";
import type { AutomationStudioLlmRerunProvenance, AutomationStudioLlmRerunScope } from "../rerun-provenance/index.ts";
import type { AutomationStudioLlmRerunOutcome } from "../rerun-provenance/index.ts";
import { automationStudioLlmEvidenceBatchMember } from "./batch-member.ts";
import { automationStudioLlmEvidenceUnusedCallId } from "../evidence-loop/call-id.ts";
import type { AutomationStudioLlmEvidenceLoopPurse, AutomationStudioLlmEvidenceLoopDecision, AutomationStudioLlmEvidenceLoopResult, AutomationStudioLlmEvidenceTool } from "../evidence-loop/index.ts";
import { automationStudioLlmEvidenceLoopFailure } from "../evidence-loop/result.ts";
import { automationStudioLlmPriorNodesAdmission } from "./admission.ts";
import { automationStudioLlmPriorNodesController } from "./controller.ts";
import { automationStudioLlmPriorNodesIdentity } from "./identity.ts";
import { automationStudioLlmEvidenceDraftKey } from "../repeat-guard/index.ts";

type ToolCall = Extract<AutomationStudioLlmEvidenceLoopDecision, { kind: "tool_call" }>;

/** Private orchestration beside the ordinary loop, sharing its actual settlement door. */
export function automationStudioLlmPriorNodesLoop(input: {
  context: AutomationStudioLlmEvidenceDecisionHandlerContext;
  toolIds: Set<string>;
  toolsById: Map<string, AutomationStudioLlmEvidenceTool>;
  provenance: AutomationStudioLlmRerunProvenance;
  currentScope(): AutomationStudioLlmRerunScope | undefined;
  eligible(): AutomationStudioLlmEvidenceTool[];
  admission: Parameters<typeof automationStudioLlmPriorNodesAdmission>[0]["admission"];
  remaining(): AutomationStudioLlmEvidenceLoopRemaining | undefined;
  purse: AutomationStudioLlmEvidenceLoopPurse;
  clock(): number;
  startedAtMs: number;
  callIds: Set<string>;
  runCall(iteration: number, callId: string, decision: ToolCall, tool: AutomationStudioLlmEvidenceTool, signature: string, options: { member: ReturnType<typeof automationStudioLlmEvidenceBatchMember> }): Promise<AutomationStudioLlmEvidenceLoopResult | undefined>;
}) {
  const ctx = input.context;
  const tool = automationStudioLlmRunNodesTool();
  const enabled = ctx.input.rerunAuthority !== undefined;
  if (enabled) {
    input.toolIds.add(tool.toolId);
    input.toolsById.set(tool.toolId, tool);
  }
  let iteration = 0, envelopeId = "", stopped = false;
  let terminal: AutomationStudioLlmEvidenceLoopResult | undefined;
  let fatal: { error: unknown } | undefined;
  let executed = 0, unproven = 0;
  // Actual producer receipts/errors stay private for this loop's lifetime, including partial lists.
  const receipts = new Map<string, AutomationStudioLlmRerunOutcome>();
  const admission = automationStudioLlmPriorNodesAdmission({
    config: ctx.input, maxToolCalls: ctx.limits.maxToolCalls, minToolCalls: ctx.limits.minToolCalls, accounting: ctx.accounting, failedCalls: () => ctx.counters.failedToolCalls,
    purse: input.purse, clock: input.clock, startedAtMs: input.startedAtMs, remaining: input.remaining, eligible: input.eligible, admission: input.admission,
    stopped: () => stopped || terminal !== undefined || ctx.noProgress.reached()
  });
  const identity = automationStudioLlmPriorNodesIdentity();
  const priorNodes = automationStudioLlmPriorNodesController({
    provenance: input.provenance, authority: ctx.input.rerunAuthority, currentScope: input.currentScope,
    world() {
      let scope: AutomationStudioLlmRerunScope | undefined;
      try { scope = input.currentScope(); } catch { scope = undefined; }
      return { scope: scope ? identity.scope(scope) : "unavailable", state: identity.hash({ state: ctx.repeats.state() ?? "unobserved" }), draft: identity.hash({ draft: automationStudioLlmEvidenceDraftKey(ctx.draftSteps) }) };
    },
    allowance: admission.allowance, admitted: (record) => admission.read(record).allowed,
    stopped: () => stopped || terminal !== undefined, mainCounts: () => ({ executed, unproven }),
    async runMember(record, index) {
      const admitted = admission.read(record);
      if (!admitted.allowed || !admitted.read.tool || !admitted.read.signature) throw new Error("Prior member not offered.");
      const callId = automationStudioLlmEvidenceUnusedCallId(input.callIds, `${envelopeId}.member.${index + 1}`);
      const member = automationStudioLlmEvidenceBatchMember(input.provenance, record, () => admission.allowance().allowed && admission.read(record).allowed);
      const decision: ToolCall = { kind: "tool_call", callId, toolId: record.toolId, input: structuredClone(record.originalValue) };
      try { terminal = await input.runCall(iteration, callId, decision, admitted.read.tool, admitted.read.signature, { member }); }
      catch (error) {
        stopped = true;
        fatal = { error };
        throw error;
      } finally {
        if (member.main === "receipt") executed += 1;
        else if (member.main === "unproven") unproven += 1;
        if (member.outcome) receipts.set(callId, member.outcome);
      }
      if (member.stopped || !member.dispatched) {
        stopped = true;
        throw new Error("Prior member stopped.", { cause: member.outcome ?? member.failure });
      }
      return { callId, result: member.result };
    }
  });
  return {
    enabled,
    remember: priorNodes.remember,
    start(next: number) {
      iteration = next;
      stopped = false;
      terminal = undefined;
      fatal = undefined;
    },
    offer(offered: AutomationStudioLlmEvidenceTool[], withholds: (id: string) => boolean) {
      const candidates = priorNodes.candidates();
      const batchOffered = candidates.length > 0 && !withholds("core.run_node") && offered.some((candidate) => candidate.toolId === "core.run_node");
      return { tools: batchOffered ? [...offered, tool] : offered, candidates: batchOffered ? candidates : [] };
    },
    shown(shown: readonly AutomationStudioLlmEvidenceEntry[], candidates: string[]): readonly AutomationStudioLlmEvidenceEntry[] {
      return candidates.length ? [...shown, { callId: `${tool.toolId}.available.${iteration}`, toolId: tool.toolId, value: { calls: candidates } }] : shown;
    },
    async run(decision: ToolCall): Promise<AutomationStudioLlmEvidenceLoopResult | undefined> {
      envelopeId = automationStudioLlmEvidenceUnusedCallId(input.callIds, decision.callId);
      input.callIds.add(envelopeId);
      const summary = await priorNodes.run(decision.input, ctx.input.signal);
      const evidenceBytes = ctx.accountEvidence(summary);
      ctx.evidence.push({ callId: envelopeId, toolId: tool.toolId, value: summary });
      const resultCode = `core.run_nodes.${summary.status}`;
      ctx.history.record(iteration, { kind: "call", signature: automationStudioLlmEvidenceCanonicalJson(decision.input), callId: envelopeId, toolId: tool.toolId, resultCode, changed: "no", ...(summary.status !== "completed" ? { refused: true } : {}) });
      ctx.recordRow({ iteration, decision: "tool_call", callId: envelopeId, toolId: tool.toolId, evidenceBytes, resultCode, ...(decision.usage ? { usage: decision.usage } : {}) }, { draftChanged: false });
      if (priorNodes.guardFailed) return automationStudioLlmEvidenceLoopFailure(ctx.draftSteps, "llm_evidence_loop.tool_failed", ctx.trace, ctx.accounting);
      if (fatal) throw fatal.error;
      if (terminal) return terminal;
      if (ctx.input.signal?.aborted) return automationStudioLlmEvidenceLoopFailure(ctx.draftSteps, "llm_evidence_loop.cancelled", ctx.trace, ctx.accounting);
      if (summary.executed === 0) {
        ctx.noProgress.stepped(tool.toolId);
        if (ctx.noProgress.reached()) return automationStudioLlmEvidenceLoopFailure(ctx.draftSteps, "llm_evidence_loop.repeat_without_progress", ctx.trace, ctx.accounting);
        ctx.noProgress.redirect(iteration);
      }
      return undefined;
    }
  };
}
