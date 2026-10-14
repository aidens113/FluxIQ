import type { AutomationStudioSubflowScope } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioProjectBuildRecordStore, AutomationStudioProjectBuildRef, AutomationStudioProjectTaskPart, AutomationStudioProjectTaskSpec } from "../../project-agents/index.ts";
import type { AutomationStudioBuildTestTaskChecklist } from "../../result-verification/index.ts";

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

  /** The checklist a subflow trial is judged against: the brief's parts, under the task spec its plan names, the whole task's `notAsked`, and the spec's other parts as out of this subflow's scope. */
  async subflow(source: Source, scope: AutomationStudioSubflowScope): Promise<AutomationStudioBuildTestTaskChecklist> {
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
      ...(others.length ? { outOfScope: others } : {})
    };
  }
});

function checked(part: AutomationStudioProjectTaskPart): AutomationStudioBuildTestTaskChecklist["parts"][number] {
  return { id: part.id, words: part.quote.text, goalFacts: [...part.goalFacts], lastingActs: [...part.lastingActs] };
}
