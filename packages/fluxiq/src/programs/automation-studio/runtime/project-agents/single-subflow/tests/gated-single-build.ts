// A single-subflow build whose builder is held to its own gate (t689): the
// supervisor fixture's build (`../../supervisor/tests/supervisor-fixture.ts`,
// a lending library's catalogue no realistic Lab scenario uses) on a registry
// with one list read, whose dispatcher's builder submits through the real
// scoped submission controller with its gate's history, as a builder's loop
// does (`flow-bootstrap/subflow-candidate/builder-loop.ts`), and tests through
// the real subflow trial gate over the port a single-subflow brief's gate is
// given (`../whole-test-port.ts`, as `../../dispatch/run-brief.ts` makes it).
// Each whole trial's result may carry Core's record of it (`standingNo`), as
// the service's candidate trial port carries it (`service/candidate-trial/run.ts`),
// and may be judged by a caller's own judge (`judged`): its verdict and
// feedback replace the fixture's, as a real judge's would (t692).
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { AutomationStudioCandidateTrialPort, AutomationStudioCandidateTrialResult, AutomationStudioFlowCandidate } from "../../../flow-bootstrap/candidate/index.ts";
import { refusalTestRegistry, refusalTestSubmission } from "../../../flow-bootstrap/candidate/tests/refusal-domain-fixture.ts";
import {
  AutomationStudioSubflowScopedSubmissionController,
  AutomationStudioSubflowTrialGate,
  type AutomationStudioSubflowProposal,
  type AutomationStudioSubflowScope,
  type AutomationStudioSubflowScopedSubmission
} from "../../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../llm/evidence-loop.ts";
import type { AutomationStudioProjectBuilderReturn, AutomationStudioProjectSubflowBrief } from "../../contracts/index.ts";
import type { AutomationStudioProjectSupervisorPorts } from "../../supervisor/index.ts";
import { BUILD, project } from "../../supervisor/tests/supervisor-fixture.ts";
import { AutomationStudioProjectWholeTestPort, type AutomationStudioProjectWholeTestTried } from "../whole-test-port.ts";

/** A list read whose fields, conditions and paging are one object, as a domain's list read takes them. */
const READ_LIST: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1", id: "web.output.read-list", version: "1.0.0", label: "Read list", description: "Read a list", category: "action",
  source: { kind: "importer", domainId: "web-automation", implementationKey: "web.read_list" }, availability: { kind: "domain", domainId: "web-automation" }, capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
  parameters: [{ id: "readList", label: "Read list", valueType: "object", required: true }]
};

export function gatedSingleBuild(options: {
  /** The scripts each brief's builder submits in turn, each tested once when accepted, until one answers yes. */
  scripts: string[][] | ((brief: AutomationStudioProjectSubflowBrief) => string[][]);
  /** How many of the first accepted proposals the builder submits without testing, so its revisions run ahead of the whole Flow's; none when absent. */
  untested?: number;
  /** Each whole trial's verdict, by its number; yes when absent. */
  trial?: (attempt: number) => AutomationStudioCandidateTrialResult["verdict"];
  /** Core's record each whole trial's result carries, by the Flow that ran; none when it answers undefined. */
  standingNo?: (candidate: Readonly<AutomationStudioFlowCandidate>, verdict: string) => unknown;
  /** Each whole trial's verdict and feedback from a caller's own judge, by its number; the fixture's when absent (header). */
  judged?: (attempt: number) => Promise<Pick<AutomationStudioCandidateTrialResult, "verdict" | "feedback">>;
  /** Told each trial's proposal with the verdict its gate kept, as the build's proposals are (`../whole-test-port.ts`). */
  tried?: AutomationStudioProjectWholeTestTried;
}) {
  const built = project(options.trial ? { trial: options.trial } : {});
  const registry: AutomationStudioNodeRegistry = refusalTestRegistry([READ_LIST]);
  const submission = refusalTestSubmission(registry);
  built.ports.submission = { ...built.ports.submission, registry };
  const whole = built.ports.trial!;
  let judgedTrials = 0;
  const ran: AutomationStudioCandidateTrialPort = async (request) => {
    const fixtureResult = await whole.port(request);
    const judged = options.judged ? await options.judged(++judgedTrials) : undefined;
    const result = judged ? { ...fixtureResult, verdict: judged.verdict, feedback: judged.feedback } : fixtureResult;
    const standingNo = options.standingNo?.(request.candidate, result.verdict);
    return standingNo === undefined ? result : { ...result, standingNo };
  };
  built.ports.trial = { candidateId: whole.candidateId, port: whole.port.prepareStart ? Object.assign(ran, { prepareStart: whole.port.prepareStart }) : ran };
  /** Every submission the builder sent, as its controller answered it, and every test its gate answered. */
  const submitted: AutomationStudioSubflowScopedSubmission[] = [];
  const tested: AutomationStudioLlmEvidenceToolExecutionResult[] = [];
  /** Each brief's gate and the proposals it accepted, for a test to read what the gate stands. */
  const gates: Array<{ gate: AutomationStudioSubflowTrialGate; scope: AutomationStudioSubflowScope; accepted: AutomationStudioSubflowProposal[] }> = [];
  const fixtureDispatch = built.ports.dispatch;
  const dispatch: AutomationStudioProjectSupervisorPorts["dispatch"] = async (request) => {
    const returns: AutomationStudioProjectBuilderReturn[] = [];
    for (const brief of request.briefs) {
      if (brief.kind === "reset" || !request.wholeTrial) {
        returns.push(...(await fixtureDispatch({ briefs: [brief], signal: request.signal })).returns);
        continue;
      }
      built.dispatched.push({ briefs: [structuredClone(brief)], signal: request.signal });
      const scope = await scopeOf(brief);
      const controller = new AutomationStudioSubflowScopedSubmissionController({ scope, siblings: [], submission });
      const port = new AutomationStudioProjectWholeTestPort(request.wholeTrial, undefined, (listed) => listed, options.tried).port;
      const gate = new AutomationStudioSubflowTrialGate({ scope, latest: () => controller.latest(), port, whole: true });
      const accepted: AutomationStudioSubflowProposal[] = [];
      gates.push({ gate, scope, accepted });
      const history = { trialOf: (proposal: Pick<AutomationStudioSubflowProposal, "revision" | "digest">) => gate.standing(proposal), refuted: (digest: string) => gate.refuted(digest) };
      let returned: AutomationStudioProjectBuilderReturn = { briefId: brief.briefId, outcome: "partial", reason: "No test of the subflow answered yes.", trials: [], spentUsd: 0.02, calls: 6 };
      const trials: AutomationStudioProjectBuilderReturn["trials"] = [];
      for (const lines of typeof options.scripts === "function" ? options.scripts(brief) : options.scripts) {
        const sent = await controller.submit({ flow: lines.join("\n") }, history);
        submitted.push(sent);
        if (!sent.ok) continue;
        accepted.push(sent.proposal);
        if (accepted.length <= (options.untested ?? 0)) continue;
        const answer = await gate.test({ revision: sent.proposal.revision, digest: sent.proposal.digest });
        tested.push(answer);
        const evidence = answer.evidence as JsonObject;
        if (typeof evidence.verdict === "string") trials.push({ kind: "subflow_trial", receiptId: typeof evidence.trialRunId === "string" ? evidence.trialRunId : `${brief.briefId}.trial-${trials.length + 1}`, digest: "c".repeat(64), verdict: evidence.verdict as AutomationStudioCandidateTrialResult["verdict"] });
        if (evidence.verdict === "yes") {
          returned = { briefId: brief.briefId, outcome: "done", reason: "Its test answered yes.", proposal: { subflowKey: brief.subflowKey, revision: sent.proposal.revision, digest: sent.proposal.digest }, trials, spentUsd: 0.02, calls: 6 };
          break;
        }
      }
      if (returned.outcome !== "done") returned = { ...returned, trials, ...(accepted.length ? { proposal: { subflowKey: brief.subflowKey, revision: accepted.at(-1)!.revision, digest: accepted.at(-1)!.digest } } : {}) };
      returns.push(returned);
    }
    return { returns };
  };
  async function scopeOf(brief: AutomationStudioProjectSubflowBrief): Promise<AutomationStudioSubflowScope> {
    const view = await built.record.read(BUILD);
    const plan = view!.record.plans.at(-1)!.plan;
    const spec = view!.record.taskSpecs.at(-1)!.taskSpec;
    const subflow = plan.plan.subflows.find((candidate) => candidate.key === brief.subflowKey)!;
    return {
      buildId: BUILD.buildId, briefId: brief.briefId, planDigest: brief.planDigest, subflowKey: brief.subflowKey,
      parts: brief.parts.map((id) => {
        const part = spec.parts.find((candidate) => candidate.id === id)!;
        return { partId: id, sourceId: part.quote.sourceId, text: part.quote.text };
      }),
      ...(subflow.interface ? { interface: subflow.interface } : {}),
      predecessors: brief.entry.predecessors
    };
  }
  built.ports.dispatch = dispatch;
  return { ...built, submitted, tested, gates, readListId: READ_LIST.id };
}
