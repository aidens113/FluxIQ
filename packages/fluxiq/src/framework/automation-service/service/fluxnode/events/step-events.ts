// A FluxNode run's `step` events, from the activity Core already tells about its Flow (the chat's own
// stream, `runtime/activity/`): each row about a step or a call that started, succeeded or failed.
// Core's words only, cut to a label; the step's id is the node or tool the row names. Best effort: a
// run tells its result whether or not anything was said on the way.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { automationStudioActivityHub } from "../../../../../runtime/activity/index.ts";
import type { FluxNodeRun } from "../fluxnode-run.ts";

const NO_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu;
const ID_UNSAFE = /[^A-Za-z0-9._:-]/gu;
const MOST_LABEL = 200;
const STATES = { started: "started", succeeded: "succeeded", failed: "failed" } as const;

/** Tells `run` each step of its Flow until the answer is called. */
export function fluxNodeStepEvents(run: FluxNodeRun): () => void {
  const { projectId, flowId } = run.target;
  let steps = 0;
  return automationStudioActivityHub.subscribe((event: ClientGatewayActivity) => {
    const detail = event.detail;
    if (event.subject.projectId !== projectId || event.subject.flowId !== flowId || !detail?.status) return;
    if (detail.kind !== "step" && detail.kind !== "tool") return;
    const label = detail.title.replace(NO_CONTROL, " ").trim();
    if (!label) return;
    steps += 1;
    const stepId = (detail.ref ?? event.step?.nodeId ?? `step.${event.step?.index ?? steps}`).replace(ID_UNSAFE, "_").slice(0, 128) || "step";
    run.tell({ type: "step", flowId, stepId, label: [...label].slice(0, MOST_LABEL).join(""), state: STATES[detail.status] });
  });
}
