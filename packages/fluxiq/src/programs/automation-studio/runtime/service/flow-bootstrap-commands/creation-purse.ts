// One purse per Flow creation, as the service wires it into a build.
//
// **The rule (t234, `../../llm/build-purse/purse.ts`).** The purse is the only
// cost authority: every build of the Flow until one is proposed or declared not
// doable draws from one ceiling, opened with what the builds before it spent
// (`../../flow-bootstrap/creation-spend/`). The chat's reading of the message
// that asked for the build (`interpretationCostUsd`) is carried on top, so the
// call that decided to build the Flow is saved into that record with the rest.
// A refuted-result repair keeps its own ceiling, never reads or writes that
// record, and carries nothing.
//
// **The step log.** The build's body is written as the creation's part, or the
// re-author's for a repair, and the instruction reading as its `read` phase
// (`../../llm/step-log/scope.ts`).
//
// **Why it is its own module.** The build's whole body runs under the purse,
// and the instruction reading it refused has to reach the permission gate, the
// loop's signal and the next decision; this keeps that wiring in one place and
// keeps `../../service.ts` from growing.

import type { AutomationStudioLlmTaskResult } from "../../llm/index.ts";
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
  store: Pick<AutomationStudioFlowBootstrapCreationSpendStore, "get" | "save" | "delete">;
  projectId: string;
  flowId: string;
  /** A refuted-result repair: its own ceiling, and no creation record read or written. */
  repair: boolean;
  /** What the chat's reading of the message that asked for the build cost: carried on top of the record's spend. A repair ignores it. */
  interpretationCostUsd?: number | undefined;
  ceilingUsd: number;
  maxCalls?: number;
}): Promise<AutomationStudioFlowBootstrapCreationPurse> {
  const { store, projectId, flowId, repair } = input;
  const creation = repair ? undefined : await store.get(projectId, flowId);
  const interpretationUsd = repair ? 0 : input.interpretationCostUsd ?? 0;
  const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: input.ceilingUsd, ...(input.maxCalls === undefined ? {} : { maxCalls: input.maxCalls }), carriedUsd: (creation?.spentUsd ?? 0) + interpretationUsd });
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
    run: async (body) => await automationStudioLlmBuildPurseScope(purse, async () => await automationStudioLlmStepLogScope.within({ part }, async () => {
      try {
        return await body();
      } finally {
        // However the build ended: the creation's spend carried to its next build, or the record gone with the creation.
        if (!repair && creationEnded) await store.delete(projectId, flowId);
        else if (!repair) { const now = Date.now(); await store.save({ kind: "flow_creation_spend", projectId, flowId, spentUsd: purse.spentUsd(), builds: (creation?.builds ?? 0) + 1, createdAt: creation?.createdAt ?? now, updatedAt: now }); }
      }
    })),
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
