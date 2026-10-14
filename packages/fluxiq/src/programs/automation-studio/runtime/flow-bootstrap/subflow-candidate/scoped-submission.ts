// One brief's submissions: a subflow builder's proposals for its own subflow
// (automation-project-agents-plan.md, `Scoped submission`).
//
// A builder writes its subflow the way a whole candidate is written -- a Flow
// script under `flow`, or a JSON plan under `plan`. A subflow the router runs
// (a scope with no `interface`) is the steps outside every block; a callable
// one (a scope with an `interface`) is `part <subflowKey>:` with its `input:`
// and `output:` lines, written as a script (`./callable-target.ts`). Each
// helper it needs is a further `part` it calls. Before anything else is asked
// of it, the submission is held to the brief:
//
// - no Router rule and no `when:` line: which situation runs which subflow is
//   the structure plan's, never a builder's;
// - no subflow but the scope's and the parts it calls, directly or through
//   another of its parts: a sibling's subflow, a recovery subflow and a block
//   nothing calls are all refused;
// - no part keyed as a sibling of the structure plan, or as the scope's own
//   subflow, as written or as the proposal keys it;
// - a callable subflow's inputs and outputs are the scope's by name, every
//   output bound; a router-run one declares none; and the success check, when
//   written, is the scope's -- one that writes none carries the plan's.
//
// What passes is exactly a probe plan -- the target and its parts, with the
// router's fallback at the target, or for a callable target at one call of it
// -- and it goes through the existing
// submission controller (`../candidate/submission.ts`) whole: every completion
// check, the binding, way-out and optional-act refusals, and the unchanged and
// refuted-Flow rules, with the scope's part quotes as the instruction text. A
// script goes through as written, so every refusal names its lines.
//
// The receipt is the controller's revision with a digest of the scope's own
// (`./subflow-digest.ts`): the target is keyed as the scope's subflow and
// carries its interface, outputs bound, and success check; each helper part is
// re-keyed `<subflowKey>-<its key>` with every call to it rewritten
// (`./part-keys.ts`), so two briefs' parts never collide when the supervisor
// assembles them; and the digest binds the brief, so
// two controllers never match each other's receipts. It grants neither
// execution nor promotion.
import type { JsonObject } from "../../../../../core/index.ts";
import { acceptAutomationStudioFlowBootstrapResult, parseAutomationStudioFlowScript } from "../authoring/index.ts";
import {
  AutomationStudioFlowCandidateSubmissionController,
  automationStudioCandidateFingerprint as fingerprint,
  type AutomationStudioCandidateTrialResult,
  type AutomationStudioFlowCandidate,
  type AutomationStudioFlowCandidateSubmission,
  type AutomationStudioFlowCandidateSubmissionHistory
} from "../candidate/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS, type AutomationStudioFlowBootstrapInterface, type AutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBootstrapSubflow } from "../plan/index.ts";
import type { AutomationStudioSubflowProposal, AutomationStudioSubflowScope, AutomationStudioSubflowScopeIdentity, AutomationStudioSubflowTrialResult } from "./contracts.ts";
import { automationStudioSubflowCallableProbe } from "./callable-target.ts";
import { automationStudioSubflowPartKey, automationStudioSubflowRekeyedParts } from "./part-keys.ts";
import type { AutomationStudioSubflowScopeIssue } from "./scope-issue.ts";
import { automationStudioSubflowProposalDigest } from "./subflow-digest.ts";

type CandidateControllerInput = ConstructorParameters<typeof AutomationStudioFlowCandidateSubmissionController>[0];

/** What a scoped submission answers: a proposal, or the candidate controller's refusal shape, so its refusal reads the same. */
export type AutomationStudioSubflowScopedSubmission =
  | { ok: true; proposal: AutomationStudioSubflowProposal }
  | Extract<AutomationStudioFlowCandidateSubmission, { ok: false }>;

/** What the subflow trial gate knows of earlier proposals, handed to `submit` by the loop that owns both. */
export type AutomationStudioSubflowSubmissionHistory = {
  trialOf?: ((proposal: Pick<AutomationStudioSubflowProposal, "revision" | "digest">) => AutomationStudioSubflowTrialResult | undefined) | undefined;
  refuted?: ((digest: string) => JsonObject | undefined) | undefined;
};

/** The code every scope refusal travels under; each issue carries its own. */
export const AUTOMATION_STUDIO_SUBFLOW_SCOPE_REFUSED_CODE = "subflow.scope_refused";

type ScopeIssue = AutomationStudioSubflowScopeIssue;

/** Session-local proposals for one brief; never the accepted Flow store, never a whole candidate. */
export class AutomationStudioSubflowScopedSubmissionController {
  private readonly inner: AutomationStudioFlowCandidateSubmissionController;
  private readonly scope: AutomationStudioSubflowScope;
  private readonly identity: AutomationStudioSubflowScopeIdentity;
  private readonly siblings: ReadonlySet<string>;
  private readonly instructionText: string;
  /** The proposal each accepted whole-probe revision is, by the probe's candidate digest. */
  private readonly proposals = new Map<string, AutomationStudioSubflowProposal>();
  private current: AutomationStudioSubflowProposal | undefined;

  constructor(private readonly input: {
    scope: AutomationStudioSubflowScope;
    /** Every other subflow key of the structure plan: what no part may be keyed as. */
    siblings: readonly string[];
    submission: Omit<CandidateControllerInput, "instructionText" | "originalSource">;
  }) {
    this.scope = fingerprint.snapshot(JSON.parse(JSON.stringify(input.scope)) as AutomationStudioSubflowScope);
    const { buildId, briefId, planDigest, subflowKey } = this.scope;
    if (![buildId, briefId, planDigest, subflowKey].every((value) => typeof value === "string" && value.length > 0)) throw new Error("subflow.scope_invalid");
    if (input.siblings.includes(subflowKey)) throw new Error("subflow.scope_invalid");
    this.identity = Object.freeze({ buildId, briefId, planDigest, subflowKey });
    this.siblings = new Set(input.siblings);
    // The brief's parts are what this subflow is asked to do: the probe's checks read them as the instruction.
    this.instructionText = this.scope.parts.map((part) => part.text).join("\n");
    this.inner = new AutomationStudioFlowCandidateSubmissionController({ ...input.submission, instructionText: this.instructionText });
  }

  /** The latest valid proposal, or none once a refusal cleared it. */
  latest(): AutomationStudioSubflowProposal | undefined {
    return !this.input.submission.signal?.aborted && this.current ? structuredClone(this.current) : undefined;
  }

  /** Whether a receipt names the latest proposal of this brief; another brief's receipt never does. */
  matches(receipt: { revision: number; digest: string }): boolean {
    return !this.input.submission.signal?.aborted && this.current?.revision === receipt.revision && this.current.digest === receipt.digest;
  }

  async submit(result: JsonObject, history: AutomationStudioSubflowSubmissionHistory = {}): Promise<AutomationStudioSubflowScopedSubmission> {
    this.input.submission.signal?.throwIfAborted();
    const read = this.read(result);
    if (read.issues.length) {
      // A refusal invalidates the standing proposal, as a refused whole candidate does.
      this.current = undefined;
      return { ok: false, revision: this.inner.lastAccepted()?.revision ?? 0, check: scopeRefusal(read.issues) };
    }
    const submitted = await this.inner.submit(read.probe, this.candidateHistory(history));
    this.input.submission.signal?.throwIfAborted();
    const latest = this.inner.latest();
    this.current = latest ? this.proposalOf(latest) : undefined;
    if (!submitted.ok) return submitted;
    return { ok: true, proposal: structuredClone(this.proposalOf(submitted.candidate)) };
  }

  /**
   * Every way the submission leaves its brief (header), and the probe the
   * existing checks run on: the submission itself, or for a callable subflow
   * its script with the call that runs it (`./callable-target.ts`).
   */
  private read(result: JsonObject): { issues: ScopeIssue[]; probe: JsonObject } {
    const issues: ScopeIssue[] = [];
    if (typeof result.flow === "string") {
      for (const block of parseAutomationStudioFlowScript(result.flow).script.blocks) {
        if (block.handler) continue;
        for (const line of block.when ?? []) issues.push({ code: "subflow.when_refused", path: `flow.line.${line.line}`, message: `The \`when:\` at line ${line.line} routes a situation. Which situation runs which subflow is the structure plan's: write this subflow and the parts it calls, and no situation.` });
      }
    }
    let probe = result;
    const contract = this.scope.interface;
    if (contract) {
      // The JSON plan reader keeps no part interface, so a callable subflow is written as a script part.
      if (typeof result.flow !== "string") return { issues: [...issues, { code: "subflow.script_required", path: "plan", message: `"${this.scope.subflowKey}" is given inputs and hands back outputs, so it is written as a Flow script under "flow": \`part ${this.scope.subflowKey}: <what it does>\` with its \`input:\` and \`output:\` lines, its steps, then \`end\`.` }], probe };
      const callable = automationStudioSubflowCallableProbe({ flow: result.flow, subflowKey: this.scope.subflowKey, contract });
      if (callable.probe === undefined) return { issues: [...issues, ...callable.issues], probe };
      probe = { ...result, flow: callable.probe };
    }
    const accepted = acceptAutomationStudioFlowBootstrapResult({ result: probe, registry: this.input.submission.registry, resolution: this.input.submission.resolution, instructionText: this.instructionText });
    // A submission that cannot be read is refused by the probe's own checks, with every issue named.
    if (!accepted.ok) return { issues, probe };
    return { issues: [...issues, ...this.planIssues(accepted.plan, result)], probe };
  }

  private planIssues(plan: AutomationStudioFlowBootstrapPlan, result: JsonObject): ScopeIssue[] {
    const issues: ScopeIssue[] = plan.router.rules.map((rule, index) => ({ code: "subflow.router_rule_refused", path: `plan.router.rules.${index}`, message: `The router rule "${rule.name}" routes a situation to "${rule.targetSubflowKey}". A subflow builder writes no router rule: write this subflow and the parts it calls, and no situation.` }));
    const contract = this.scope.interface;
    const entry = entryOf(plan);
    const target = contract ? plan.subflows.find((subflow) => subflow.key === this.scope.subflowKey) : entry;
    if (!target) return [...issues, { code: "subflow.target_missing", path: "plan.router.fallback", message: `No steps stand outside every block. Write the steps of "${this.scope.subflowKey}" outside every block, and its helpers as parts they call.` }];
    if (!contract && target.key !== this.scope.subflowKey && this.siblings.has(target.key)) issues.push(foreign(target.key, "plan.router.fallback"));
    const parts = calledParts(plan, target.key);
    plan.subflows.forEach((subflow, index) => {
      // A callable subflow's probe runs it from one appended call, which is no part of the proposal (`./callable-target.ts`).
      if (subflow === target || (contract && subflow === entry)) return;
      if (!parts.has(subflow.key)) issues.push(foreign(subflow.key, `plan.subflows.${index}`));
      else if (this.collides(subflow.key)) issues.push({ code: "subflow.part_key_collision", path: `plan.subflows.${index}`, message: `The part "${subflow.key}" has the key of another subflow of the structure plan. Give the part a name of its own.` });
    });
    // A JSON plan's reader keeps no interface or metadata, so what the model wrote there is read off what it sent.
    const sent = sentSubflow(result, target.key);
    // A callable subflow's inputs and outputs were held to the scope's by name already; a router-run one takes none.
    if (!contract && (target.interface ?? sent?.interface) !== undefined) {
      issues.push({ code: "subflow.interface_changed", path: `plan.subflows.${plan.subflows.indexOf(target)}.interface`, message: "This subflow is run by the router, so here it is given no inputs and hands back no outputs; ask the supervisor for a change." });
    }
    const sentMetadata = isObject(sent?.metadata) ? sent.metadata : undefined;
    const written = target.metadata?.["fluxiq.successCheck"] ?? sentMetadata?.["fluxiq.successCheck"];
    if (written !== undefined && canonical(written) !== canonical(this.scope.successCheck ?? null)) {
      issues.push({ code: "subflow.success_check_changed", path: `plan.subflows.${plan.subflows.indexOf(target)}.metadata`, message: `This subflow's success check is the structure plan's and cannot change here: ${JSON.stringify(this.scope.successCheck ?? null)}. Leave out \`done when:\` for it, or write exactly that.` });
    }
    return issues;
  }

  /** Whether a helper part's key, as written or as the proposal keys it, is another subflow's of the structure plan. */
  private collides(key: string): boolean {
    return key === this.scope.subflowKey || this.siblings.has(key) || this.siblings.has(automationStudioSubflowPartKey(this.scope.subflowKey, key));
  }

  /**
   * The probe's revision as this brief's proposal: the target keyed as the
   * scope's, carrying its interface (outputs bound as the part wrote them) and
   * success check, then its helper parts re-keyed under it (`./part-keys.ts`).
   * The target's step and derived dataset ids follow the scope's key too
   * where the probe wrote it under another (a router-run entry as `main`).
   */
  private proposalOf(candidate: AutomationStudioFlowCandidate): AutomationStudioSubflowProposal {
    const known = this.proposals.get(candidate.digest);
    if (known) return known;
    const plan = candidate.buildPlan.plan;
    const contract = this.scope.interface;
    const entry = entryOf(plan);
    const written = contract ? plan.subflows.find((subflow) => subflow.key === this.scope.subflowKey) : entry;
    if (!written) throw new Error("subflow.probe_target_missing");
    const target: AutomationStudioFlowBootstrapSubflow = { ...structuredClone(written), key: this.scope.subflowKey };
    if (contract) target.interface = boundInterface(contract, written.interface);
    const successCheck = target.metadata?.["fluxiq.successCheck"] ?? this.scope.successCheck;
    if (successCheck) target.metadata = { ...target.metadata, "fluxiq.successCheck": structuredClone(successCheck) };
    const parts = plan.subflows.filter((subflow) => subflow !== written && !(contract && subflow === entry));
    const subflows = automationStudioSubflowRekeyedParts(target, parts, { targetWrittenKey: written.key });
    const submission = this.input.submission;
    const digest = automationStudioSubflowProposalDigest({ scope: this.identity, projectId: submission.projectId, flowId: submission.flowId, baseDependencyDigest: submission.baseDependencyDigest, instructionText: this.instructionText, subflows });
    const proposal: AutomationStudioSubflowProposal = { scope: { ...this.identity }, revision: candidate.revision, digest, subflows, summary: candidate.summary, changedPaths: [...candidate.changedPaths] };
    this.proposals.set(candidate.digest, proposal);
    return proposal;
  }

  /** The subflow gate's history, as the candidate controller asks it: by the probe's revision and digest. */
  private candidateHistory(history: AutomationStudioSubflowSubmissionHistory): AutomationStudioFlowCandidateSubmissionHistory {
    const adapted: AutomationStudioFlowCandidateSubmissionHistory = {};
    const trialOf = history.trialOf;
    const refuted = history.refuted;
    if (trialOf) adapted.trialOf = (candidate) => {
      const proposal = this.proposals.get(candidate.digest);
      const trial = proposal ? trialOf(proposal) : undefined;
      return trial ? candidateTrial(trial, candidate) : undefined;
    };
    if (refuted) adapted.refuted = (digest) => {
      const proposal = this.proposals.get(digest);
      return proposal ? refuted(proposal.digest) : undefined;
    };
    return adapted;
  }
}

/** A partial verdict as the unchanged-submission rule reads a trial: the probe's revision and digest, the verdict and its feedback. */
function candidateTrial(trial: AutomationStudioSubflowTrialResult, candidate: Pick<AutomationStudioFlowCandidate, "revision" | "digest">): AutomationStudioCandidateTrialResult {
  const read: AutomationStudioCandidateTrialResult = { revision: candidate.revision, digest: candidate.digest, verdict: trial.verdict, feedback: structuredClone(trial.feedback) };
  if (trial.trialRunId) read.trialRunId = trial.trialRunId;
  return read;
}

/** The keys of the parts the target calls, directly or through another of them. */
function calledParts(plan: AutomationStudioFlowBootstrapPlan, targetKey: string): Set<string> {
  const byKey = new Map(plan.subflows.map((subflow) => [subflow.key, subflow]));
  const reached = new Set<string>();
  const queue = [targetKey];
  while (queue.length) {
    const subflow = byKey.get(queue.shift()!);
    for (const node of subflow?.nodes ?? []) {
      const called = node.definitionId === AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS.callSubflow ? (node.parameters as JsonObject | undefined)?.subflowId : undefined;
      if (typeof called !== "string" || called === targetKey || reached.has(called)) continue;
      reached.add(called);
      queue.push(called);
    }
  }
  return reached;
}

/** The subflow a JSON plan's sender wrote under this key, as sent; none for a script or a plan not written as a subflow list. */
function sentSubflow(result: JsonObject, key: string): JsonObject | undefined {
  const plan = result.plan;
  const subflows = isObject(plan) ? plan.subflows : undefined;
  if (!Array.isArray(subflows)) return undefined;
  return subflows.find((entry): entry is JsonObject => isObject(entry) && entry.key === key);
}

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function foreign(key: string, path: string): ScopeIssue {
  return { code: "subflow.foreign_subflow_refused", path, message: `"${key}" is not this brief's subflow or a part it calls. A subflow builder writes only its own subflow, outside every block, and the parts it calls; another subflow of the plan is another brief's.` };
}

/** The router's fallback Subflow: the steps outside every block. */
function entryOf(plan: AutomationStudioFlowBootstrapPlan): AutomationStudioFlowBootstrapSubflow | undefined {
  const fallback = plan.router.fallback;
  return fallback.kind === "subflow" ? plan.subflows.find((subflow) => subflow.key === fallback.targetSubflowKey) : undefined;
}

/** The scope's interface with each output bound as the written part binds it; every other field the scope's. */
function boundInterface(contract: AutomationStudioFlowBootstrapInterface, written: AutomationStudioFlowBootstrapInterface | undefined): AutomationStudioFlowBootstrapInterface {
  const outputs = contract.outputs.map((port) => {
    const binding = written?.outputs.find((output) => output.id === port.id)?.metadata?.binding;
    return binding ? { ...structuredClone(port), metadata: { binding: structuredClone(binding) } } : structuredClone(port);
  });
  return { inputs: structuredClone(contract.inputs), outputs };
}

function scopeRefusal(issues: readonly ScopeIssue[]): Extract<AutomationStudioFlowCandidateSubmission, { ok: false }>["check"] {
  return {
    ok: false,
    issueCodes: [...new Set(issues.map((issue) => issue.code))],
    feedback: {
      ok: false,
      code: AUTOMATION_STUDIO_SUBFLOW_SCOPE_REFUSED_CODE,
      issues: issues.map((issue) => issue.path === undefined ? { code: issue.code, message: issue.message } : { code: issue.code, path: issue.path, message: issue.message }),
      instruction: "This submission writes outside its brief. Correct every listed issue and submit this subflow again with core.submit_subflow: its own steps outside every block, and only the parts they call."
    }
  };
}

function canonical(value: unknown): string {
  return JSON.stringify(fingerprint.snapshot(JSON.parse(JSON.stringify(value ?? null)) as unknown));
}
