import { createScaleAutomationStudioProjectFixture } from "./scale-project-fixture";

export const PHASE11_VISIBLE_WORK_BUDGETS = Object.freeze({
  hierarchyRows: 100,
  subscribedViews: 64,
  examinedViewIds: 128,
  runPageRows: 25,
});

export type Phase11IndexedSequence = readonly string[] & {
  readonly reads: () => number;
  readonly highestReadIndex: () => number;
};

export function createPhase11DeterministicScaleFixture() {
  const project = createScaleAutomationStudioProjectFixture();
  const logicalViewIds = createIndexedSequence(1_000_000, "view");
  return {
    project,
    logicalViewIds,
    flowEntries: project.flows.map((flow) => [flow.flowId, flow] as const),
    firstRunPageIds: Object.freeze(
      project.runs.slice(0, PHASE11_VISIBLE_WORK_BUDGETS.runPageRows).map((run) => run.runId),
    ),
  };
}

function createIndexedSequence(length: number, prefix: string): Phase11IndexedSequence {
  let reads = 0;
  let highestReadIndex = -1;
  const target = new Array<string>(length);
  return new Proxy(target, {
    get(array, property, receiver) {
      if (property === "reads") return () => reads;
      if (property === "highestReadIndex") return () => highestReadIndex;
      if (typeof property === "string" && /^\d+$/u.test(property)) {
        const index = Number(property);
        reads += 1;
        highestReadIndex = Math.max(highestReadIndex, index);
        return `${prefix}.${index}`;
      }
      return Reflect.get(array, property, receiver);
    },
  }) as unknown as Phase11IndexedSequence;
}
