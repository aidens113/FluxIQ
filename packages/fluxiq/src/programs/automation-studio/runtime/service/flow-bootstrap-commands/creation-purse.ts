// One purse per Flow creation, as the service wires it into a build.
//
// **The rule (t234, `../../llm/build-purse/purse.ts`).** The purse is the only
// cost authority: every build of the Flow until one is proposed or declared not
// doable draws from one ceiling, opened with what the builds before it spent
// (`../../flow-bootstrap/creation-spend/`). The chat's reading of the message
// that asked for the build (`interpretationCostUsd`) is carried on top, so the
// call that decided to build the Flow is saved into that record with the rest.
// A repair's build carries nothing here and never reads or writes that record:
// it is handed only what its repair's purse has left
// (`../../recovery/refuted-result/purse.ts`).
//
// **In a Lab-scoped run the record is the Flow's whole purse (t438).** The
// user's words (2026-10-01): "bring the ceiling down to $0.1 per flow max".
// One purse per Flow: its build, re-authors, repairs and judge all count
// against it, in billed dollars, with no cap on output. So where the run cost
// ceiling is Lab-scoped (`FLUXIQ_LLM_RUN_COST_CEILING_SCOPE=test`) the build's
// body also runs under the Flow's purse (`../creation-spend.ts`,
// `withFlowPurse`), which adds every call to the record as it settles; the
// chat's reading is added to the record when the build opens; and the record
// outlives the creation, so the Flow's runs, their repairs and their checks
// draw on what the creation left, and a later build of the same Flow -- an
// extend after it was proposed -- carries everything the Flow has spent.
// Outside the Lab it goes with the creation, as before: a product Flow's limit
// is per run.
//
// **The step log.** The build's body is written as the creation's part, or the
// re-author's for a repair, and the instruction reading as its `read` phase
// (`../../llm/step-log/scope.ts`).
//
// **Why it is its own module.** The build's whole body runs under the purse,
// and the instruction reading it refused has to reach the permission gate, the
// loop's signal and the next decision; this keeps that wiring in one place and
// keeps `../../service.ts` from growing.

import { resolveAutomationStudioLlmTestRunCostCeilingUsd } from "../../../model/index.ts";
import { automationStudioLlmRunCostCeilingUsd, type AutomationStudioLlmTaskResult } from "../../llm/index.ts";
import { AutomationStudioLlmBuildPurse, AutomationStudioLlmBuildPurseRefused, automationStudioLlmBuildPurseScope, type AutomationStudioLlmBuildPurseRefusal } from "../../llm/build-purse/index.ts";
import { automationStudioLlmStepLogScope } from "../../llm/step-log/index.ts";
import type { AutomationStudioParkingPort } from "../../parking/index.ts";
import type { AutomationStudioFlowBootstrapCreationSpendStore } from "../index.ts";

/** One build's share of its Flow creation's purse. */
export type AutomationStudioFlowBootstrapCreationPurse = {
  /** The purse every call of this build is held against. */
  readonly purse: AutomationStudioLlmBuildPurse;
  /** The instruction reading, when the purse refused it. */
  readonly readingRefused: AutomationStudioLlmBuildPurseRefusal | undefined;
  /** Runs the build's whole body under the purse, then keeps or drops the creation's record however the body ended. */
  run<T>(body: () => Promise<T>): Promise<T>;
  /** The instruction authority's `run`, noting a reading the purse refused. */
  reading<Request>(run: (request: Request) => Promise<AutomationStudioLlmTaskResult>): (request: Request) => Promise<AutomationStudioLlmTaskResult>;
  /** The permission gate's ask port, which opens no question once the reading was refused. */
  askPort(port: AutomationStudioParkingPort): AutomationStudioParkingPort;
  /** The loop's signal from the permission gate's, which a refused reading does not abort. */
  signal(permissions: AbortSignal): AbortSignal;
  /** Throws the reading's refusal, as the purse's own, when the reading was refused. */
  endIfReadingRefused(): void;
  /** Whether the creation is over: a Flow proposed, or the build ended not doable. */
  ended(over?: boolean): void;
};

export async function automationStudioFlowBootstrapCreationPurse(input: {
  store: Pick<AutomationStudioFlowBootstrapCreationSpendStore, "get" | "save" | "delete" | "add" | "spentNowUsd" | "withFlowPurse">;
  projectId: string;
  flowId: string;
  /** A repair's build: the ceiling its repair's purse handed it, and no creation record read or written. */
  repair: boolean;
  /** Whether the record is the Flow's whole purse and outlives the creation: by default, whether the run cost ceiling is Lab-scoped. */
  flowPurse?: boolean | undefined;
  /** What the chat's reading of the message that asked for the build cost: carried on top of the record's spend. A repair ignores it. */
  interpretationCostUsd?: number | undefined;
  ceilingUsd: number;
  maxCalls?: number;
}): Promise<AutomationStudioFlowBootstrapCreationPurse> {
  const { store, projectId, flowId, repair } = input;
  const flowPurse = input.flowPurse ?? resolveAutomationStudioLlmTestRunCostCeilingUsd() !== undefined;
  const creation = repair ? undefined : await store.get(projectId, flowId);
  const interpretationUsd = repair ? 0 : input.interpretationCostUsd ?? 0;
  // In a Lab-scoped run the chat's reading is the Flow's spend: added to its record, which is then what the build carries.
  const labCreation = flowPurse && !repair;
  if (labCreation && interpretationUsd > 0) await store.add(projectId, flowId, interpretationUsd);
  const carriedUsd = labCreation ? store.spentNowUsd(projectId, flowId) : (creation?.spentUsd ?? 0) + interpretationUsd;
  const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: input.ceilingUsd, ...(input.maxCalls === undefined ? {} : { maxCalls: input.maxCalls }), carriedUsd });
  const part = repair ? "reauthor" : "creation";
  let creationEnded = false; // A Flow proposed, or the build ended not doable: the creation is over, and its record goes with it.
  // A call the purse refused, never sent: its own figures, read off the harness's refusal.
  const purseRefusalOf = (result: AutomationStudioLlmTaskResult): AutomationStudioLlmBuildPurseRefusal | undefined => !result.ok && result.providerInvocation === "not_attempted" && purse.refusal && result.diagnostics.some((diagnostic) => diagnostic.code === purse.refusal?.code) ? { ...purse.refusal } : undefined;
  // The instruction reading, refused by the purse. Read as "the instruction asks for nothing" it made the gate ask the person about the next lasting step and the build end on that question; it is the money that ran out, so no question is opened for it and the next decision ends the build on cost.
  let readingRefused: AutomationStudioLlmBuildPurseRefusal | undefined;
  return {
    purse,
    get readingRefused() { return readingRefused; },
    // The build's whole body runs under the purse, so the instruction reading, every decision, the test and the judge are held against it (`../../llm/build-purse/run.ts`).
    run: async (body) => {
      const built = async () => await automationStudioLlmBuildPurseScope(purse, async () => await automationStudioLlmStepLogScope.within({ part }, async () => {
        try {
          return await body();
        } finally {
          // However the build ended: the creation's spend carried to its next build, or the record gone with the creation. In a Lab-scoped run every call is already in the record, which stays as the Flow's purse; the build is counted.
          if (labCreation) await store.add(projectId, flowId, 0, { build: true });
          else if (!repair && creationEnded) await store.delete(projectId, flowId);
          else if (!repair) { const now = Date.now(); await store.save({ kind: "flow_creation_spend", projectId, flowId, spentUsd: purse.spentUsd(), builds: (creation?.builds ?? 0) + 1, createdAt: creation?.createdAt ?? now, updatedAt: now }); }
        }
      }));
      // The Flow's purse holds the Lab ceiling; the build's own may be lower. A repair's build is already under its run's.
      return flowPurse ? await store.withFlowPurse(projectId, flowId, automationStudioLlmRunCostCeilingUsd(), built) : await built();
    },
    reading: (run) => async (request) => { const answer = await automationStudioLlmStepLogScope.within({ phase: "read" }, () => run(request)); readingRefused ??= purseRefusalOf(answer); return answer; },
    askPort: (port) => ({ open: (ask) => { if (readingRefused) throw new AutomationStudioLlmBuildPurseRefused(readingRefused); return port.open(ask); }, ...(port.awaitAnswer ? { awaitAnswer: port.awaitAnswer.bind(port) } : {}) }),
    signal: (permissions) => {
      // A plan step refused only because the reading was not paid for does not stop the loop: its next decision ends it on cost.
      const planRefused = new AbortController(); permissions.addEventListener("abort", () => { if (!readingRefused) planRefused.abort(permissions.reason); }, { once: true });
      return planRefused.signal;
    },
    // The reading was refused: the build ends on cost here, not on a question.
    endIfReadingRefused: () => { if (readingRefused) { purse.refusal = readingRefused; throw new AutomationStudioLlmBuildPurseRefused(readingRefused); } },
    ended: (over = true) => { creationEnded = over; }
  };
}
