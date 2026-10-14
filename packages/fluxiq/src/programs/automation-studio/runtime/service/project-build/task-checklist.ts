import type { AutomationStudioSubflowProposal, AutomationStudioSubflowScope } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioProjectBuildRecordStore, AutomationStudioProjectBuildRef, AutomationStudioProjectTaskPart, AutomationStudioProjectTaskSpec } from "../../project-agents/index.ts";
import type { AutomationStudioBuildTestTaskChecklist, AutomationStudioRunResultSummary } from "../../result-verification/index.ts";

// The task checklist a project build's judges read beside the instructions
// (unit A9; plan, Contracts, `Task spec`), from the build record:
//
// - **A whole trial** is judged against the record's latest task spec: every
//   part and everything `notAsked` names.
// - **A subflow trial** is judged against the brief's parts alone, each as the
//   task spec the brief's plan names holds it (its goal facts and lasting acts
//   too), with the whole task's `notAsked`, which binds every subflow, and the
//   spec's other parts as `outOfScope`: each another subflow's work, which a
//   step of this trial must not do (t594; A8 launch 7, where a first subflow
//   also did the next one's press and both judges said yes). Where the record
//   has no such spec, the brief's own parts and words, and no other part.
//   And, where earlier subflows ran in the trial to prepare its entry, those
//   subflows and their steps (`entry`, t599): setup judged in their own
//   trials, never this subflow's out-of-scope step nor its rows to account
//   for. Core finds them in the trial's summary: the predecessors'
//   keys -- their `part` helpers too -- and the steps whose nodeId ends
//   `.<subflow key>.<node key>` of a predecessor proposal's subflow (the id a
//   plan node is minted with, `flow-bootstrap/adaptation.ts`; a trial calls
//   every proposal as a part, so none reuses an assembled id), with the steps
//   whose `subflowId` names one of those subflows (the trial root's calls).
//
// **How the whole trials find the record.** They are made in the service
// before the project build's record exists (`./whole-trials.ts`), so the
// project build binds its record to the trial environment it was handed, the
// same one the service gave the whole trials, as it binds the acts writer
// (`./run.ts`). A candidate build binds nothing, so its whole trials find no
// checklist and its judge is asked what it always was.

type Source = { records: Pick<AutomationStudioProjectBuildRecordStore, "read">; ref: AutomationStudioProjectBuildRef };

const BOUND = new WeakMap<object, Source>();

export const AutomationStudioProjectBuildTaskChecklist = Object.freeze({
  /** Binds a project build's record to its trial environment, for its whole trials' judge. */
  bind(environment: object, source: Source): void {
    BOUND.set(environment, source);
  },

  /** The checklist a whole trial is judged against: the latest task spec of the record bound to `environment`; none in a candidate build or before a spec is written. */
  async whole(environment: object): Promise<AutomationStudioBuildTestTaskChecklist | undefined> {
    const source = BOUND.get(environment);
    if (!source) return undefined;
    const spec = (await source.records.read(source.ref))?.record.taskSpecs.at(-1)?.taskSpec;
    return spec ? { parts: spec.parts.map(checked), notAsked: [...spec.notAsked] } : undefined;
  },

  /**
   * The checklist a subflow trial is judged against: the brief's parts, under the task spec its plan names, the whole task's `notAsked`,
   * the spec's other parts as out of this subflow's scope, and the steps that prepared its entry where any ran (header).
   */
  async subflow(source: Source, scope: AutomationStudioSubflowScope, entry?: AutomationStudioBuildTestTaskChecklist["entry"]): Promise<AutomationStudioBuildTestTaskChecklist> {
    const record = (await source.records.read(source.ref))?.record;
    const plan = record?.plans.find((entry) => entry.plan.digest === scope.planDigest)?.plan;
    const spec: AutomationStudioProjectTaskSpec | undefined = plan ? record?.taskSpecs.find((entry) => entry.taskSpec.digest === plan.taskSpecDigest)?.taskSpec : undefined;
    const own = new Set(scope.parts.map((part) => part.partId));
    const others = (spec?.parts ?? []).filter((part) => !own.has(part.id)).map((part) => ({ id: part.id, words: part.quote.text }));
    return {
      parts: scope.parts.map((part) => {
        const known = spec?.parts.find((candidate) => candidate.id === part.partId);
        return known ? checked(known) : { id: part.partId, words: part.text, goalFacts: [], lastingActs: [] };
      }),
      notAsked: [...(spec?.notAsked ?? [])],
      ...(others.length ? { outOfScope: others } : {}),
      ...(entry?.steps.length ? { entry: { subflows: [...entry.subflows], steps: [...entry.steps] } } : {})
    };
  },

  /**
   * The steps of a subflow trial that prepared its entry, and whose (header):
   * every summary step or read whose nodeId a predecessor proposal's subflow
   * minted, and every step whose `subflowId` names one of those subflows. None
   * without predecessors, or where none of their steps is in the summary.
   */
  entry(summary: AutomationStudioRunResultSummary, predecessors: readonly AutomationStudioSubflowProposal[]): AutomationStudioBuildTestTaskChecklist["entry"] {
    const subflows = predecessors.flatMap((proposal) => proposal.subflows);
    if (!subflows.length) return undefined;
    const minted = subflows.flatMap((subflow) => subflow.nodes.map((node) => `.${subflow.key}.${node.key}`));
    const called = subflows.map((subflow) => `.${subflow.key}`);
    const ids = [...new Set([...summary.flowShape.map((step) => step.nodeId), ...(summary.reads ?? []).map((read) => read.nodeId)])];
    const calls = new Set(summary.flowShape.filter((step) => {
      const target = step.parameters?.subflowId;
      return typeof target === "string" && called.some((key) => target.endsWith(key));
    }).map((step) => step.nodeId));
    const steps = ids.filter((id) => calls.has(id) || minted.some((suffix) => id.endsWith(suffix)));
    return steps.length ? { subflows: [...new Set(subflows.map((subflow) => subflow.key))], steps } : undefined;
  }
});

function checked(part: AutomationStudioProjectTaskPart): AutomationStudioBuildTestTaskChecklist["parts"][number] {
  return { id: part.id, words: part.quote.text, goalFacts: [...part.goalFacts], lastingActs: [...part.lastingActs] };
}
