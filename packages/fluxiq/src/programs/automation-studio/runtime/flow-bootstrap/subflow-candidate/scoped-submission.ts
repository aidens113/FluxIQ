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
//   the scope has one, is the scope's -- written exactly, or left out and
//   carried. When the scope has none (the plan the project supervisor writes
//   carries none; t569), proposing one is the builder's: the check it writes,
//   by `done when:` or a JSON plan's metadata, becomes its subflow's.
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
//
// **A refusal shows the script the builder sent (t581).** A callable
// subflow's checks run on the probe, its script with a call appended
// (`./callable-target.ts`), and the existing check returns the script it read
// as `previous`, which a builder is told to resend with only the listed issues
// fixed. On the A8 bigbox run two builders did exactly that and were refused
// `subflow.steps_outside_part` for Core's own probe lines. Every copy of the
// probe in a refusal is now the script as sent.
//
// **A revision keeps its brief's lasting act (t581).** Once a revision of this
// brief Core accepted declared a lasting act (a step whose `consequences` name
// one), a revision that declares none is refused
// `subflow.lasting_act_dropped`: on the A8 bigbox run a store-switching
// subflow's revision 4 read a list and switched nothing. A brief may only do
// the acts its parts ask (`project-agents/supervisor/brief-input.ts`, the
// permission gate holds a submission to them), so an act an accepted revision
// did is one its parts ask for, and a subflow without any cannot do them.
//
// **A brief whose parts ask a lasting act declares one from the first (t594).**
// On A8 launch 7 (crossborder) a dependent builder's part asked a lasting act
// and every one of its submissions pressed with `consequences: none`, so no
// act was recorded, reset or reported. When the scope's parts carry the
// lasting acts the task spec files under them (`lastingActs`), a submission
// that declares none is refused `subflow.lasting_act_missing`. Which class a
// press declares is the builder's judgement, as the permission gate leaves it
// (`project-agents/contracts/asked-acts.ts`), so only that some act is
// declared is asked.
//
// **A step that can make no lasting act declares none (t609).** A step of one
// of Core's own nodes that acts on nothing outside the run -- a wait, a branch,
// a variable, whose `automationStudioNodeSideEffectClass` is `none` -- leaves
// nothing on the site whatever it declares, and a trial records no act for it
// (`../../service/candidate-trial/landed-acts.ts`, t598). So its `consequences`
// count toward neither rule above: a subflow whose only declared act sits on a
// wait is refused `subflow.lasting_act_missing`, as one declaring none is. A
// Core node that does reach outside (a recorded action, a database write)
// counts, as a domain step does.
//
// **An output hands on a value, never a step's route (t594).** On the same run
// a first builder bound its interface output to a click's success port
// (`$step.<label>.success`): a routing signal, which says only that the step
// worked. The next subflow then navigated to it as an address. An output bound
// to a port whose role is success or failure is refused
// `subflow.output_not_a_value` (`./route-outputs.ts`).
//
// **A proposal that drops a condition Core's record kept is refused once
// (t641).** The candidate controller this one wraps refuses, once, a
// submission that no longer writes a condition Core's record showed keeps out
// only rows the request does not ask for (`../candidate/submission.ts`). The
// subflow gate keeps those conditions on the result it keeps for each trial
// (`keptConditions`, `./subflow-trial-gate.ts`), and the history handed to the
// candidate controller carries them through, so a brief's proposals are held
// to its own trials as a whole candidate's are.
//
// **A brief's revisions are numbered on from the one it starts from (A8 towels
// `run-mvac0nmw`, t658).** A repair builder was shown the subflow it repaired
// at "revision 3" of an earlier brief, its own first proposal was revision 1,
// and it spent four decisions testing revision 3, refused
// `subflow.trial_stale_revision`, before it saw the two were not the same. A
// brief shown an earlier brief's revision -- a repair's, or a proposal an
// amendment carried -- now numbers its own on from it (`revisionsAfter`): from
// 3, its first accepted revision is 4. The candidate controller this one wraps
// numbers from 1 and is not this module's, so the numbering is translated at
// this boundary only: a proposal's revision, a refusal's, and the revisions its
// refusal names (its `revision`, the standing revision, each kept condition's,
// and "revision N" in its instruction and issue messages) go out on this
// brief's numbering, and the kept conditions handed back in from this brief's
// trials come back to the candidate controller's (`./submission-numbering.ts`).
// What a trial or a judge said (`lastTrial`, `judged`) is never renumbered: it
// already speaks of this brief's revisions.
//
// **One receipt per plan, in every answer (t741).** The candidate controller
// compares a submission with its last accepted revision only, so a plan it
// accepted before another, sent again, is a new revision there; this brief
// answers it with the proposal it first was, its own revision and digest. Its
// later refusals named the controller's revision ("revision 14", photo rerun
// `run-mvgobp8h-b99ede98` 0381; "revision 7", social `run-mvgoawg4-ed85dd5a`
// 0171) and the probe candidate's digest, neither a receipt this brief issued,
// and the trial gate refused what they named as stale. Each revision the
// controller accepts is now remembered as the proposal it is, and a refusal's
// revisions and digests, in its fields and its words, read through that map
// (`./submission-numbering.ts`): every pair it names is one `matches()`
// accepts, or the receipt of a proposal this brief answered earlier.
//
// **An input another subflow hands on may go unread (t672).** A callable
// subflow's inputs that an earlier subflow of the plan hands on are the
// scope's `handedOn`. One no line reads is no refusal (`./callable-target.ts`):
// the proposal carries it as `unneededInputs`, which the builder's answer and
// its brief's return say, so the supervisor amends nothing for it.
//
// **A toggle a trial pass made is read under the probe's keys (t792).** A
// trial runs the proposal, so the record of a press the domain answered as a
// toggle in it (`../explored-toggles.ts`, t787) names its trial node
// `<...>.<proposal key>.<node key>`: this brief's subflow under the scope's key,
// each part under its rekeyed one (`./part-keys.ts`). The candidate controller
// ties a step to it by the step's identity, its parameters as written, and by
// the probe's own `<subflow key>.<node key>` only between two steps written the
// same (`../script-statements/toggle-tie.ts`, t792). The probe names this
// subflow as it was written -- a script's own steps as `main` -- so before the
// identity tie a repair's resubmission of the step a trial pressed never
// carried `ensureState`, and flipped the control back (debug
// run-mvswfjbq-d0a95f6e); the place still has to read the same for twins. The
// controller is handed the build's record with each trial node also named as
// the probe of the submission it checks names it; nothing else in the record
// changes.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { acceptAutomationStudioFlowBootstrapResult, parseAutomationStudioFlowScript } from "../authoring/index.ts";
import {
  AutomationStudioFlowCandidateSubmissionController,
  automationStudioCandidateFingerprint as fingerprint,
  type AutomationStudioCandidateTrialResult,
  type AutomationStudioFlowCandidate,
  type AutomationStudioFlowCandidateSubmission,
  type AutomationStudioFlowCandidateSubmissionHistory
} from "../candidate/index.ts";
// Its own barrel, not result-verification's, whose reads import flow-bootstrap back (a module cycle).
import type { AutomationStudioResultKeptConditionsCarrier } from "../../result-verification/standing-no/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS, type AutomationStudioFlowBootstrapInterface, type AutomationStudioFlowBootstrapNode, type AutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBootstrapSubflow } from "../plan/index.ts";
import type { AutomationStudioExploredToggle } from "../script-statements/index.ts";
import { authoringScopePartOf, type AuthoringPartOfStep } from "../record-defaults/index.ts";
import { automationStudioNodeSideEffectClass } from "../../executor/index.ts";
import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioSubflowProposal, AutomationStudioSubflowScope, AutomationStudioSubflowScopeIdentity, AutomationStudioSubflowTrialResult } from "./contracts.ts";
import { automationStudioSubflowCallableProbe } from "./callable-target.ts";
import { automationStudioSubflowRouteOutputs } from "./route-outputs.ts";
import { automationStudioSubflowPartKey, automationStudioSubflowRekeyedParts } from "./part-keys.ts";
import type { AutomationStudioSubflowScopeIssue } from "./scope-issue.ts";
import { automationStudioSubflowProposalDigest } from "./subflow-digest.ts";
import { automationStudioSubflowRenumberedRefusal } from "./submission-numbering.ts";
import { AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID } from "./submit-tool.ts";
import { AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID } from "./subflow-trial-gate.ts";

type CandidateControllerInput = ConstructorParameters<typeof AutomationStudioFlowCandidateSubmissionController>[0];

/** What a scoped submission answers: a proposal, or the candidate controller's refusal shape, so its refusal reads the same. */
export type AutomationStudioSubflowScopedSubmission =
  | { ok: true; proposal: AutomationStudioSubflowProposal; advice?: string[] }
  | Extract<AutomationStudioFlowCandidateSubmission, { ok: false }>;

/** What the subflow trial gate knows of earlier proposals, handed to `submit` by the loop that owns both. */
export type AutomationStudioSubflowSubmissionHistory = {
  trialOf?: ((proposal: Pick<AutomationStudioSubflowProposal, "revision" | "digest">) => AutomationStudioSubflowTrialResult | undefined) | undefined;
  refuted?: ((digest: string) => JsonObject | undefined) | undefined;
};

/** The code every scope refusal travels under; each issue carries its own. */
export const AUTOMATION_STUDIO_SUBFLOW_SCOPE_REFUSED_CODE = "subflow.scope_refused";

type ScopeIssue = AutomationStudioSubflowScopeIssue;

/** The builder's own submit and test tools, and what it submits: what its refusals name (t632). */
const SUBFLOW_TOOLS = Object.freeze({ submit: AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, test: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, subject: "subflow" });

/** Session-local proposals for one brief; never the accepted Flow store, never a whole candidate. */
export class AutomationStudioSubflowScopedSubmissionController {
  private readonly inner: AutomationStudioFlowCandidateSubmissionController;
  private readonly scope: AutomationStudioSubflowScope;
  private readonly identity: AutomationStudioSubflowScopeIdentity;
  private readonly siblings: ReadonlySet<string>;
  private readonly instructionText: string;
  /** The proposal each accepted whole-probe revision is, by the probe's candidate digest. */
  private readonly proposals = new Map<string, AutomationStudioSubflowProposal>();
  /** The success check a builder proposed in a JSON plan, which the plan reader does not keep, by the probe's candidate digest (header). */
  private readonly proposedChecks = new Map<string, NonNullable<AutomationStudioSubflowScope["successCheck"]>>();
  /** The handed-on inputs no line of the submission reads, by the probe's candidate digest (header, t672). */
  private readonly unneeded = new Map<string, string[]>();
  /** The step labels of the script each accepted probe came from, by the probe's candidate digest (header, t811). */
  private readonly labels = new Map<string, Record<string, string[]>>();
  private current: AutomationStudioSubflowProposal | undefined;
  /** The lasting consequences the accepted revisions of this brief declared, in the order first seen (header). */
  private readonly lasting: string[] = [];
  /** How far this brief's revisions are numbered past the candidate controller's (header, t658). */
  private readonly offset: number;
  /** The proposal each revision the candidate controller accepted is: a plan it accepted again after another is a new revision there, and still its first proposal here (header, t741). */
  private readonly byInnerRevision = new Map<number, AutomationStudioSubflowProposal>();
  /** The key the submission being checked wrote each subflow under, by the key its proposal gives it (header, t792). */
  private written: ReadonlyMap<string, string> = new Map();
  /** Which part a step serves, for the record-output defaults (K5, t800). */
  private readonly partOf: AuthoringPartOfStep | undefined;
  /** How a refusal's revisions and digests read on this brief's numbering (`./submission-numbering.ts`, t741). */
  private readonly numbering = {
    revision: (inner: number): number => this.byInnerRevision.get(inner)?.revision ?? inner + this.offset,
    digest: (inner: string): string => this.proposals.get(inner)?.digest ?? inner
  };

  constructor(private readonly input: {
    scope: AutomationStudioSubflowScope;
    /** Every other subflow key of the structure plan: what no part may be keyed as. */
    siblings: readonly string[];
    submission: Omit<CandidateControllerInput, "instructionText" | "originalSource">;
    /** The earlier brief's revision this brief starts from: its own are numbered on from it (header, t658). Absent, from 1. */
    revisionsAfter?: number | undefined;
  }) {
    const after = input.revisionsAfter ?? 0;
    if (!Number.isSafeInteger(after) || after < 0) throw new Error("subflow.scope_invalid");
    this.offset = after;
    this.scope = fingerprint.snapshot(JSON.parse(JSON.stringify(input.scope)) as AutomationStudioSubflowScope);
    const { buildId, briefId, planDigest, subflowKey } = this.scope;
    if (![buildId, briefId, planDigest, subflowKey].every((value) => typeof value === "string" && value.length > 0)) throw new Error("subflow.scope_invalid");
    if (input.siblings.includes(subflowKey)) throw new Error("subflow.scope_invalid");
    this.identity = Object.freeze({ buildId, briefId, planDigest, subflowKey });
    this.siblings = new Set(input.siblings);
    // The brief's parts are what this subflow is asked to do: the probe's checks read them as the instruction.
    this.instructionText = this.scope.parts.map((part) => part.text).join("\n");
    // Its refusals name this loop's tools, never the whole candidate's (`../candidate/unchanged-submission.ts`, t632).
    // The build's toggles, each trial node also under the probe's keys (header, t792).
    const toggles = input.submission.exploredToggles;
    const probeToggles = toggles ? { exploredToggles: { list: () => underProbeKeys(toggles.list(), this.written) } } : {};
    // A record output this brief leaves half written is filled from the one part that owes records (K5, t800); none or several: as before.
    this.partOf = input.submission.partOf ?? authoringScopePartOf(this.scope.parts.map((part) => ({ id: part.partId, words: part.text, columns: part.answer?.columns })));
    this.inner = new AutomationStudioFlowCandidateSubmissionController({ ...input.submission, ...probeToggles, ...(this.partOf ? { partOf: this.partOf } : {}), instructionText: this.instructionText, refusalTools: SUBFLOW_TOOLS, askedConsequences: [...new Set(this.scope.parts.flatMap((part) => part.lastingActs ?? []))] });
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
      const last = this.inner.lastAccepted();
      return { ok: false, revision: last ? this.numbering.revision(last.revision) : 0, check: scopeRefusal(read.issues) };
    }
    this.written = read.written ?? new Map();
    const submitted = await this.inner.submit(read.probe, this.candidateHistory(history));
    this.input.submission.signal?.throwIfAborted();
    if (submitted.ok && read.proposedCheck) this.proposedChecks.set(submitted.candidate.digest, read.proposedCheck);
    if (submitted.ok && read.unneeded) this.unneeded.set(submitted.candidate.digest, read.unneeded);
    if (submitted.ok) this.labels.set(submitted.candidate.digest, read.labels ?? {});
    const latest = this.inner.latest();
    this.current = latest ? this.proposalOf(latest) : undefined;
    if (!submitted.ok) return automationStudioSubflowRenumberedRefusal(read.probe === result ? submitted : asSent(submitted, read.probe, result), this.numbering);
    const proposal = this.proposalOf(submitted.candidate);
    for (const consequence of lastingOf(proposal.subflows)) if (!this.lasting.includes(consequence)) this.lasting.push(consequence);
    // What the candidate controller advised beside its acceptance, steps with no witness among it (t791 fix 2).
    return { ok: true, proposal: structuredClone(proposal), ...(submitted.advice?.length ? { advice: submitted.advice } : {}) };
  }

  /**
   * Every way the submission leaves its brief (header), and the probe the
   * existing checks run on: the submission itself, or for a callable subflow
   * its script with the call that runs it (`./callable-target.ts`).
   */
  private read(result: JsonObject): { issues: ScopeIssue[]; probe: JsonObject; proposedCheck?: NonNullable<AutomationStudioSubflowScope["successCheck"]>; unneeded?: string[]; written?: ReadonlyMap<string, string>; labels?: Record<string, string[]> } {
    const issues: ScopeIssue[] = [];
    if (typeof result.flow === "string") {
      for (const block of parseAutomationStudioFlowScript(result.flow).script.blocks) {
        if (block.handler) continue;
        for (const line of block.when ?? []) issues.push({ code: "subflow.when_refused", path: `flow.line.${line.line}`, message: `The \`when:\` at line ${line.line} routes a situation. Which situation runs which subflow is the structure plan's: write this subflow and the parts it calls, and no situation.` });
      }
    }
    let probe = result;
    let unneeded: string[] | undefined;
    const contract = this.scope.interface;
    if (contract) {
      // The JSON plan reader keeps no part interface, so a callable subflow is written as a script part.
      if (typeof result.flow !== "string") return { issues: [...issues, { code: "subflow.script_required", path: "plan", message: `"${this.scope.subflowKey}" is given inputs and hands back outputs, so it is written as a Flow script under "flow": \`part ${this.scope.subflowKey}: <what it does>\` with its \`input:\` and \`output:\` lines, its steps, then \`end\`.` }], probe };
      const callable = automationStudioSubflowCallableProbe({ flow: result.flow, subflowKey: this.scope.subflowKey, contract, handedOn: this.scope.handedOn });
      if (callable.probe === undefined) return { issues: [...issues, ...callable.issues], probe };
      probe = { ...result, flow: callable.probe };
      unneeded = callable.unneeded;
    }
    const accepted = acceptAutomationStudioFlowBootstrapResult({ result: probe, registry: this.input.submission.registry, resolution: this.input.submission.resolution, instructionText: this.instructionText, partOf: this.partOf });
    // A submission that cannot be read is refused by the probe's own checks, with every issue named.
    if (!accepted.ok) return { issues, probe };
    const read = this.planIssues(accepted.plan, result);
    return { issues: [...issues, ...read.issues], probe, ...(read.proposedCheck ? { proposedCheck: read.proposedCheck } : {}), ...(unneeded ? { unneeded } : {}), written: this.writtenKeys(accepted.plan), ...(accepted.locator?.stepKeys ? { labels: structuredClone(accepted.locator.stepKeys) } : {}) };
  }

  private planIssues(plan: AutomationStudioFlowBootstrapPlan, result: JsonObject): { issues: ScopeIssue[]; proposedCheck?: NonNullable<AutomationStudioSubflowScope["successCheck"]> } {
    const issues: ScopeIssue[] = plan.router.rules.map((rule, index) => ({ code: "subflow.router_rule_refused", path: `plan.router.rules.${index}`, message: `The router rule "${rule.name}" routes a situation to "${rule.targetSubflowKey}". A subflow builder writes no router rule: write this subflow and the parts it calls, and no situation.` }));
    const contract = this.scope.interface;
    const entry = entryOf(plan);
    const target = contract ? plan.subflows.find((subflow) => subflow.key === this.scope.subflowKey) : entry;
    if (!target) return { issues: [...issues, { code: "subflow.target_missing", path: "plan.router.fallback", message: `No steps stand outside every block. Write the steps of "${this.scope.subflowKey}" outside every block, and its helpers as parts they call.` }] };
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
    // The scope's check, when it has one, is the plan's and cannot change; with none, the builder's own is its proposal (header).
    if (this.scope.successCheck !== undefined && written !== undefined && canonical(written) !== canonical(this.scope.successCheck)) {
      issues.push({ code: "subflow.success_check_changed", path: `plan.subflows.${plan.subflows.indexOf(target)}.metadata`, message: `This subflow's success check is the structure plan's and cannot change here: ${JSON.stringify(this.scope.successCheck)}. Leave out \`done when:\` for it, or write exactly that.` });
    }
    const proposedCheck = this.scope.successCheck === undefined && Array.isArray(written) && written.length ? structuredClone(written) as NonNullable<AutomationStudioSubflowScope["successCheck"]> : undefined;
    if (contract) issues.push(...automationStudioSubflowRouteOutputs(target, this.input.submission));
    // The subflow and the parts it calls, never a callable target's probe call (header).
    const declared = lastingOf([target, ...plan.subflows.filter((subflow) => parts.has(subflow.key))]);
    const asked = [...new Set(this.scope.parts.flatMap((part) => part.lastingActs ?? []))];
    if (asked.length && !declared.length) {
      issues.push({ code: "subflow.lasting_act_missing", path: "flow", message: `The parts of "${this.scope.subflowKey}" ask for a lasting act (${asked.join(", ")}), and no step of this submission declares one, so it cannot do what its parts ask. `
        + "The step that does the act changes the site, and it stays: declare it on that step, `consequences: <act>`, and change nothing else. "
        + "If the page already shows that act done where this subflow starts, a subflow before it did it: end the brief blocked and say so, naming the part and the act under doneBefore ({\"part\": \"<the part's id>\", \"act\": \"<the act id its entry note lists>\"}), so the plan can change." });
    } else if (this.lasting.length && !declared.length) {
      issues.push({ code: "subflow.lasting_act_dropped", path: "flow", message: `An earlier revision of "${this.scope.subflowKey}" that Core accepted did a lasting act (${this.lasting.join(", ")}), and this one does none, so it cannot do what its parts ask. `
        + "Keep the step that does the act, its consequences declared, and change only what the last refusal or trial feedback names. If the act cannot be done here, end the brief honestly instead." });
    }
    return { issues, ...(proposedCheck ? { proposedCheck } : {}) };
  }

  /** Whether a helper part's key, as written or as the proposal keys it, is another subflow's of the structure plan. */
  private collides(key: string): boolean {
    return key === this.scope.subflowKey || this.siblings.has(key) || this.siblings.has(automationStudioSubflowPartKey(this.scope.subflowKey, key));
  }

  /**
   * The probe's revision as this brief's proposal: the target keyed as the
   * scope's, carrying its interface (outputs bound as the part wrote them) and
   * success check -- the scope's, or with none the one the builder proposed -- then its helper parts re-keyed under it (`./part-keys.ts`).
   * The target's step and derived dataset ids follow the scope's key too
   * where the probe wrote it under another (a router-run entry as `main`).
   * A plan the candidate controller accepts again after another is the
   * proposal it first was, its revision and digest unchanged, and the
   * controller's new revision is remembered as that proposal (header, t741).
   */
  private proposalOf(candidate: AutomationStudioFlowCandidate): AutomationStudioSubflowProposal {
    const known = this.proposals.get(candidate.digest);
    if (known) {
      // The labels are no part of the digest, so a relabelled script of the same plan carries its newest.
      this.carryLabels(known, candidate.digest);
      this.byInnerRevision.set(candidate.revision, known);
      return known;
    }
    const plan = candidate.buildPlan.plan;
    const contract = this.scope.interface;
    const entry = entryOf(plan);
    const written = contract ? plan.subflows.find((subflow) => subflow.key === this.scope.subflowKey) : entry;
    if (!written) throw new Error("subflow.probe_target_missing");
    const target: AutomationStudioFlowBootstrapSubflow = { ...structuredClone(written), key: this.scope.subflowKey };
    if (contract) target.interface = boundInterface(contract, written.interface);
    const successCheck = target.metadata?.["fluxiq.successCheck"] ?? this.scope.successCheck ?? this.proposedChecks.get(candidate.digest);
    if (successCheck) target.metadata = { ...target.metadata, "fluxiq.successCheck": structuredClone(successCheck) };
    const parts = plan.subflows.filter((subflow) => subflow !== written && !(contract && subflow === entry));
    const subflows = automationStudioSubflowRekeyedParts(target, parts, { targetWrittenKey: written.key });
    const submission = this.input.submission;
    const digest = automationStudioSubflowProposalDigest({ scope: this.identity, projectId: submission.projectId, flowId: submission.flowId, baseDependencyDigest: submission.baseDependencyDigest, instructionText: this.instructionText, subflows });
    const proposal: AutomationStudioSubflowProposal = { scope: { ...this.identity }, revision: candidate.revision + this.offset, digest, subflows, summary: candidate.summary, changedPaths: [...candidate.changedPaths] };
    const unneeded = this.unneeded.get(candidate.digest);
    if (unneeded) proposal.unneededInputs = [...unneeded];
    this.carryLabels(proposal, candidate.digest);
    this.proposals.set(candidate.digest, proposal);
    this.byInnerRevision.set(candidate.revision, proposal);
    return proposal;
  }

  /** The key `plan` wrote each subflow under, by the key its proposal gives it (`proposalOf`): this subflow's, then each part's (header, t792). */
  private writtenKeys(plan: AutomationStudioFlowBootstrapPlan): ReadonlyMap<string, string> {
    const contract = this.scope.interface;
    const entry = entryOf(plan);
    const written = contract ? plan.subflows.find((subflow) => subflow.key === this.scope.subflowKey) : entry;
    const keys = new Map<string, string>();
    if (!written) return keys;
    keys.set(this.scope.subflowKey, written.key);
    for (const part of plan.subflows) if (part !== written && !(contract && part === entry)) keys.set(automationStudioSubflowPartKey(this.scope.subflowKey, part.key), part.key);
    return keys;
  }

  /** Puts the step labels the candidate's script wrote on `proposal`; none for a JSON plan. */
  private carryLabels(proposal: AutomationStudioSubflowProposal, digest: string): void {
    const labels = this.labels.get(digest);
    if (labels && Object.keys(labels).length) proposal.stepLabels = structuredClone(labels);
    else delete proposal.stepLabels;
  }

  /** The subflow gate's history, as the candidate controller asks it: by the probe's revision and digest. */
  private candidateHistory(history: AutomationStudioSubflowSubmissionHistory): AutomationStudioFlowCandidateSubmissionHistory {
    const adapted: AutomationStudioFlowCandidateSubmissionHistory = {};
    const trialOf = history.trialOf;
    const refuted = history.refuted;
    if (trialOf) adapted.trialOf = (candidate) => {
      const proposal = this.proposals.get(candidate.digest);
      const trial = proposal ? trialOf(proposal) : undefined;
      return trial ? candidateTrial(trial, candidate, this.offset) : undefined;
    };
    if (refuted) adapted.refuted = (digest) => {
      const proposal = this.proposals.get(digest);
      return proposal ? refuted(proposal.digest) : undefined;
    };
    return adapted;
  }
}

/**
 * A refusal of a callable subflow's probe as the builder is shown it: every
 * copy of the probe script -- the check's `previous` above all -- is the
 * script the builder sent (header).
 */
function asSent(submitted: Extract<AutomationStudioFlowCandidateSubmission, { ok: false }>, probe: JsonObject, sent: JsonObject): Extract<AutomationStudioFlowCandidateSubmission, { ok: false }> {
  const probed = probe.flow;
  const written = sent.flow;
  if (typeof probed !== "string" || typeof written !== "string" || !submitted.check.feedback) return submitted;
  return { ...submitted, check: { ...submitted.check, feedback: replaced(submitted.check.feedback, probed, written) as JsonObject } };
}

function replaced(value: JsonValue, from: string, to: string): JsonValue {
  if (value === from) return to;
  if (Array.isArray(value)) return value.map((entry) => replaced(entry, from, to));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replaced(entry as JsonValue, from, to)]));
  return value;
}

/**
 * The lasting consequences these subflows' steps declare, in order: a step's `consequences` naming any (`[]` and none say
 * nothing lasting), on a step that can make a lasting act at all -- never one of Core's own that acts on nothing outside the run (header, t609).
 */
function lastingOf(subflows: readonly AutomationStudioFlowBootstrapSubflow[]): string[] {
  return [...new Set(subflows.flatMap((subflow) => subflow.nodes.flatMap((node) => canLast(node) ? node.consequences ?? [] : [])))];
}

/** Core's own nodes; those whose side-effect class is `none` act on nothing outside the run (header). */
const CORE_NODE_PREFIX = "builtin.";

/** Whether the step's node could leave anything on the site: a domain step, or a Core node that reaches outside the run (header). */
function canLast(node: AutomationStudioFlowBootstrapNode): boolean {
  if (!node.definitionId.startsWith(CORE_NODE_PREFIX)) return true;
  const flowNode: AutomationStudioFlowNode = { id: node.key, definitionId: node.definitionId, definitionVersion: node.definitionVersion, parameterValues: node.parameters ?? {} };
  return automationStudioNodeSideEffectClass(flowNode) !== "none";
}

/** A partial verdict as the unchanged-submission rule reads a trial: the probe's revision and digest, the verdict and its feedback. */
function candidateTrial(trial: AutomationStudioSubflowTrialResult & AutomationStudioResultKeptConditionsCarrier, candidate: Pick<AutomationStudioFlowCandidate, "revision" | "digest">, offset: number): AutomationStudioCandidateTrialResult {
  const read: AutomationStudioCandidateTrialResult & AutomationStudioResultKeptConditionsCarrier = { revision: candidate.revision, digest: candidate.digest, verdict: trial.verdict, feedback: structuredClone(trial.feedback) };
  if (trial.trialRunId) read.trialRunId = trial.trialRunId;
  // The conditions the subflow gate kept (t641, `./subflow-trial-gate.ts`), for the candidate controller to hold the next proposal to, on its own numbering (header, t658).
  if (trial.keptConditions?.length) read.keptConditions = trial.keptConditions.map((condition) => ({ ...structuredClone(condition), revision: condition.revision - offset }));
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

/**
 * Each toggle with every trial node `<...>.<proposal key>.<node key>` also
 * named `<...>.<written key>.<node key>`, as the probe writes that subflow
 * (header, t792); a toggle of no trial, or of another subflow, as it was.
 */
function underProbeKeys(toggles: readonly AutomationStudioExploredToggle[], written: ReadonlyMap<string, string>): AutomationStudioExploredToggle[] {
  return toggles.map((toggle) => {
    const aliases = (toggle.trialNodes ?? []).flatMap((id) => [...written].flatMap(([proposalKey, writtenKey]) => {
      const at = id.lastIndexOf(`.${proposalKey}.`);
      return at < 0 || writtenKey === proposalKey ? [] : [`${id.slice(0, at)}.${writtenKey}.${id.slice(at + proposalKey.length + 2)}`];
    }));
    return aliases.length ? { ...toggle, trialNodes: [...toggle.trialNodes!, ...aliases] } : toggle;
  });
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
