// Reviewing a change FluxIQ suggested: reading what it would do, accepting it
// all the way into the Flow, or turning it down.
//
// `version.accept` approves and stops there, which is a whole step short for a
// built or improved Flow: a Flow Bootstrap change is `proposed`, approving
// makes it `validated`, and only applying puts it into the Flow
// (`adaptations/adaptation-model.ts`, `adaptationReviewActions`). A person who
// says "keep it" means the Flow should have it, so `adaptation.apply` takes the
// change through both. `version.rollBack` stays the way back out of one
// already applied; `adaptation.reject` never reverts anything, it only turns
// down a change that has not reached the Flow.
//
// Each finds the change itself when none is named -- the Flow's newest one
// still waiting -- because a person says "show me what it wants to change",
// never an adaptation id.

import { getFlowAdaptation, listFlowAdaptations, reviewFlowAdaptation } from "../../../adaptations";
import { automationStudioViewId } from "../../../views";
import { definePanelCapability, panelCapabilityResult, type PanelCapability, type PanelCapabilityContext, type PanelCapabilityOutcome } from "../contract";
import { PROJECT, FLOW } from "./argument";
import { str } from "./value";

const CHANGE = { name: "adaptationId", kind: "id", describe: "The suggested change. Leave it out for the Flow's newest one still waiting for review.", required: false } as const;

export const ADAPTATION_CAPABILITIES: readonly PanelCapability[] = [
  definePanelCapability({
    id: "adaptation.show",
    title: "Show what a suggested change would do",
    summary: "Reads a change FluxIQ suggested for a Flow and says what it would add or alter, before anything is kept.",
    group: "Versions",
    phrases: ["what does it want to change", "show me the change", "what would change", "show the suggested change", "what's the diff"],
    control: { view: automationStudioViewId.adaptations, label: "Changes" },
    endpoints: ["list-flow-adaptations", "get-flow-adaptation"],
    arguments: [PROJECT, FLOW, CHANGE],
    consequences: [],
    invoke: async (context, args) => {
      const projectId = str(args, "projectId");
      const flowId = str(args, "flowId");
      const found = await waitingChange(context.transport, projectId, flowId, str(args, "adaptationId"));
      if (!found.ok) return found.outcome;
      const read = await getFlowAdaptation(context.transport, { projectId, flowId, adaptationId: found.adaptationId });
      const adaptation = read.ok ? read.payload?.adaptation : undefined;
      if (!read.ok || !adaptation) return panelCapabilityResult(read.ok ? { ok: false, error: "The suggested change was not found." } : read, "", "The suggested change could not be read.");
      return { status: "done", summary: suggestedChangeSentence(adaptation), payload: { adaptation } };
    }
  }),
  definePanelCapability({
    id: "adaptation.apply",
    title: "Accept a suggested change into the Flow",
    summary: "Accepts a change FluxIQ suggested and applies it, so the Flow has it from its next run.",
    group: "Versions",
    phrases: ["apply the change", "keep the suggested change", "accept and apply", "put the change in", "use the new version"],
    control: { view: automationStudioViewId.adaptations, label: "Apply Changes" },
    endpoints: ["list-flow-adaptations", "review-flow-adaptation"],
    arguments: [PROJECT, FLOW, CHANGE],
    consequences: ["modify_existing"],
    invoke: async (context, args) => {
      const projectId = str(args, "projectId");
      const flowId = str(args, "flowId");
      const found = await waitingChange(context.transport, projectId, flowId, str(args, "adaptationId"));
      if (!found.ok) return found.outcome;
      const review = (action: "approve" | "apply") => reviewFlowAdaptation(context.transport, { projectId, flowId, adaptationId: found.adaptationId, action });
      // A change still `proposed` is approved first; one already `validated`
      // goes straight to apply. A named change the listing did not return has
      // no known status, so it is approved first too and the review says if
      // that was wrong.
      if (found.status !== "validated") {
        const approved = await review("approve");
        if (!approved.ok) return panelCapabilityResult(approved, "", "The change could not be accepted.");
      }
      return panelCapabilityResult(await review("apply"), "Applied the change. The Flow uses it from its next run.", "The change was accepted but could not be applied.");
    }
  }),
  definePanelCapability({
    id: "adaptation.reject",
    title: "Turn down a suggested change",
    summary: "Rejects a change FluxIQ suggested that has not reached the Flow, so the Flow stays as it is.",
    group: "Versions",
    phrases: ["don't apply it", "discard the suggestion", "reject the suggested change", "no, leave it as it was"],
    control: { view: automationStudioViewId.adaptations, label: "Reject" },
    endpoints: ["list-flow-adaptations", "review-flow-adaptation"],
    arguments: [PROJECT, FLOW, CHANGE, { name: "reason", kind: "text", describe: "Why it is being turned down.", required: false }],
    consequences: ["modify_existing"],
    invoke: async (context, args) => {
      const projectId = str(args, "projectId");
      const flowId = str(args, "flowId");
      const found = await waitingChange(context.transport, projectId, flowId, str(args, "adaptationId"));
      if (!found.ok) return found.outcome;
      return panelCapabilityResult(
        await reviewFlowAdaptation(context.transport, {
          projectId,
          flowId,
          adaptationId: found.adaptationId,
          action: "reject",
          reason: str(args, "reason").trim() || "Turned down from the conversation."
        }),
        "Turned the change down. The Flow is unchanged.",
        "The change could not be rejected."
      );
    }
  })
];

/** States a suggested change waits in before it reaches the Flow. */
const WAITING = new Set(["proposed", "testing", "validated"]);

type WaitingChange =
  | { ok: true; adaptationId: string; status: string }
  | { ok: false; outcome: PanelCapabilityOutcome };

/** The named change, or the Flow's newest one still waiting for review. */
async function waitingChange(transport: PanelCapabilityContext["transport"], projectId: string, flowId: string, adaptationId: string): Promise<WaitingChange> {
  const listed = await listFlowAdaptations(transport, { projectId, flowId, sort: "updated", direction: "desc", limit: 50, offset: 0 });
  if (!listed.ok) {
    const summary = "The Flow's suggested changes could not be read.";
    return { ok: false, outcome: { status: "failed", summary, error: listed.error ?? summary, ...((listed as { retryable?: boolean }).retryable ? { retryable: true } : {}) } };
  }
  const changes: Array<{ adaptationId?: unknown; status?: unknown }> = listed.payload?.adaptations ?? listed.payload?.page?.adaptations ?? [];
  const change = adaptationId
    ? changes.find((entry) => entry.adaptationId === adaptationId)
    : changes.find((entry) => typeof entry.status === "string" && WAITING.has(entry.status));
  if (change && typeof change.adaptationId === "string") return { ok: true, adaptationId: change.adaptationId, status: String(change.status ?? "") };
  if (adaptationId) return { ok: true, adaptationId, status: "" };
  const summary = "That Flow has no suggested change waiting for review.";
  return { ok: false, outcome: { status: "failed", summary, error: summary } };
}

/** A suggested change in a person's words: why, what it touches, and where it stands. */
export function suggestedChangeSentence(adaptation: any): string {
  const why = typeof adaptation?.diagnosis === "string" && adaptation.diagnosis.trim() ? adaptation.diagnosis.trim() : typeof adaptation?.trigger === "string" ? adaptation.trigger : "FluxIQ suggested a change.";
  const parts: string[] = Array.isArray(adaptation?.patch)
    ? adaptation.patch.map((entry: any) => (typeof entry?.summary === "string" ? entry.summary.trim() : "")).filter(Boolean)
    : [];
  const status = typeof adaptation?.status === "string" ? adaptation.status : "proposed";
  const where = WAITING.has(status) ? "It is waiting for you to accept or reject it." : `It is ${status}.`;
  return [why.replace(/[.!?]?$/u, "."), parts.length ? `It changes: ${parts.join(" ")}` : "It lists no individual changes.", where].join(" ");
}
