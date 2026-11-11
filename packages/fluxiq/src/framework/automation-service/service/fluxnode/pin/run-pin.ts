// A FluxNode run's pin, once its attempt is over (`./pins.ts`): the version it replayed, and the change it
// held, which the run also tells as a skipped step under the code, so a program reading the events sees it
// before the result. Never throws: the result is already safe, so a pin that could not be recorded is told
// as a failed step and the run keeps its ending; the pinned Flow was never written, so nothing is lost but
// the proposal's record, which the run's own Flow (`flowId` on the step) still holds.

import { FLUXNODE_PINNED_CHANGE_HELD, type FluxNodeRunPathKind, type FluxNodeRunPinned } from "@fluxiq/contracts/fluxnode";
import type { FluxNodeRun } from "../fluxnode-run.ts";
import type { FluxNodeRegisteredSpec } from "../owner-flows.ts";
import type { FluxNodePinnedAttempt, FluxNodePins } from "./pins.ts";

const HELD = "Kept the changed Flow as a proposal, since this FluxNode is pinned";

export async function fluxNodeRunPin(input: {
  run: FluxNodeRun;
  registered: FluxNodeRegisteredSpec;
  pins: Pick<FluxNodePins, "settleUnpinned"> | undefined;
  pinned: FluxNodePinnedAttempt | undefined;
  path: FluxNodeRunPathKind;
  mode: "auto" | "explore";
}): Promise<FluxNodeRunPinned | undefined> {
  const { run, registered, pinned } = input;
  try {
    const pin = pinned ? await pinned.settle(input.path) : input.mode === "explore" ? undefined : await input.pins?.settleUnpinned(registered, run.runId, input.path);
    if (pin?.held) run.tell({ type: "step", flowId: pin.held.proposal.flowId, stepId: FLUXNODE_PINNED_CHANGE_HELD, label: HELD, state: "skipped" });
    return pin;
  } catch (error) {
    run.tell({ type: "step", flowId: pinned?.flowId ?? registered.flowId, stepId: "fluxnode.pin", label: `Core could not record this run's pin (${error instanceof Error ? error.name : "unknown error"}).`, state: "failed" });
    return pinned ? { ...pinned.pin } : undefined;
  }
}
