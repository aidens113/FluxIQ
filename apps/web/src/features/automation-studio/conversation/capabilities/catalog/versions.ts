// Versions, and undoing a change that made a Flow worse.
//
// `version.rollBack` is the one a person reaches for when the model has just
// ruined something, so it takes the words they would actually use -- "undo
// that", "put it back", "that made it worse" -- rather than the word the
// panel uses on the button.

import { listFlowAdaptations, reviewFlowAdaptation } from "../../../adaptations";
import { AUTOMATION_FLOW_ENDPOINTS } from "../../../flow-editor";
import { automationStudioViewId } from "../../../views";
import { definePanelCapability, panelCapabilityResult, type PanelCapability, type PanelCapabilityContext } from "../contract";
import { PROJECT, FLOW } from "./argument";
import { str } from "./value";

export const VERSION_CAPABILITIES: readonly PanelCapability[] = [
  definePanelCapability({
    id: "version.list",
    title: "List a Flow's published versions",
    summary: "Shows which versions of the Flow have been published and which are in service.",
    group: "Versions",
    phrases: ["what versions", "list the versions", "published versions", "which version is live"],
    control: { view: automationStudioViewId.settings, label: "Publications" },
    endpoints: ["list-flow-publications"],
    arguments: [PROJECT, FLOW],
    consequences: [],
    invoke: async (context, args) => panelCapabilityResult(
      await context.transport.post("list-flow-publications", { projectId: str(args, "projectId"), flowId: str(args, "flowId") }),
      "Here are the published versions.",
      "The versions could not be read."
    )
  }),
  definePanelCapability({
    id: "version.publish",
    title: "Publish a version of a Flow",
    summary: "Fixes the Flow as it stands now as a named version, so it can be returned to later.",
    group: "Versions",
    phrases: ["publish it", "save this version", "cut a version", "release the flow"],
    control: { view: automationStudioViewId.settings, label: "Publish" },
    endpoints: [AUTOMATION_FLOW_ENDPOINTS.publish],
    arguments: [
      PROJECT,
      FLOW,
      { name: "version", kind: "text", describe: "What to call the version.", required: true },
      { name: "changelog", kind: "text", describe: "What changed.", required: false }
    ],
    consequences: ["create_new"],
    invoke: async (context, args) => panelCapabilityResult(
      await context.transport.post(AUTOMATION_FLOW_ENDPOINTS.publish, {
        projectId: str(args, "projectId"),
        flowId: str(args, "flowId"),
        version: str(args, "version"),
        changelog: str(args, "changelog"),
        publishedBy: "conversation"
      }),
      "Published the version.",
      "The version could not be published."
    )
  }),
  definePanelCapability({
    id: "version.rollBack",
    title: "Roll a change back",
    summary: "Rejects a change the model made to the Flow, putting it back the way it was before. With no change named, it is the Flow's latest one.",
    group: "Versions",
    phrases: ["roll it back", "undo that", "revert the change", "put it back", "reject the change", "that made it worse"],
    control: { view: automationStudioViewId.adaptations, label: "Reject change" },
    endpoints: ["list-flow-adaptations", "review-flow-adaptation"],
    arguments: [
      PROJECT,
      FLOW,
      { name: "adaptationId", kind: "id", describe: "The change to roll back. Leave it out for the Flow's latest change.", required: false },
      { name: "reason", kind: "text", describe: "Why it is being rolled back.", required: false }
    ],
    consequences: ["modify_existing"],
    invoke: async (context, args) => {
      // A person says "roll the news digest back", never a change id, so the
      // change is found here. The review sends what the Adaptations view's
      // buttons send: an applied change is reverted, and one that never
      // reached the Flow is rejected.
      const projectId = str(args, "projectId");
      const flowId = str(args, "flowId");
      const found = await changeInEffect(context.transport, projectId, flowId, str(args, "adaptationId"));
      if (!found.ok) return { status: "failed", summary: found.summary, error: found.summary, ...(found.retryable ? { retryable: true } : {}) };
      return panelCapabilityResult(
        await reviewFlowAdaptation(context.transport, {
          projectId,
          flowId,
          adaptationId: found.adaptationId,
          action: found.status === "applied" ? "revert" : "reject",
          reason: args.reason ? str(args, "reason") : "Rolled back from the conversation."
        }),
        "Rolled the change back.",
        "The change could not be rolled back."
      );
    }
  }),
  definePanelCapability({
    id: "version.accept",
    title: "Accept a change the model made",
    summary: "Approves a change the model proposed, so the Flow keeps it.",
    group: "Versions",
    phrases: ["accept it", "approve the change", "keep that", "that is better"],
    control: { view: automationStudioViewId.adaptations, label: "Accept change" },
    endpoints: ["review-flow-adaptation"],
    arguments: [PROJECT, FLOW, { name: "adaptationId", kind: "id", describe: "The change to accept.", required: true }],
    consequences: ["modify_existing"],
    invoke: async (context, args) => panelCapabilityResult(
      await reviewFlowAdaptation(context.transport, { projectId: str(args, "projectId"), flowId: str(args, "flowId"), adaptationId: str(args, "adaptationId"), action: "approve" }),
      "Kept the change.",
      "The change could not be accepted."
    )
  }),
  definePanelCapability({
    id: "version.deprecate",
    title: "Take a published version out of service",
    summary: "Marks a published version as no longer to be used.",
    group: "Versions",
    phrases: ["deprecate", "retire the version", "stop using that version"],
    control: { view: automationStudioViewId.settings, label: "Deprecate" },
    endpoints: [AUTOMATION_FLOW_ENDPOINTS.deprecate],
    arguments: [
      PROJECT,
      FLOW,
      { name: "version", kind: "text", describe: "The version to retire.", required: true },
      { name: "reason", kind: "text", describe: "Why it is being retired.", required: true }
    ],
    consequences: ["modify_existing"],
    invoke: async (context, args) => panelCapabilityResult(
      await context.transport.post(AUTOMATION_FLOW_ENDPOINTS.deprecate, {
        projectId: str(args, "projectId"),
        flowId: str(args, "flowId"),
        version: str(args, "version"),
        reason: str(args, "reason")
      }),
      "Took the version out of service.",
      "The version could not be retired."
    )
  })
];

/** States in which a change still shapes the Flow, so rolling it back means something. */
const IN_EFFECT = new Set(["proposed", "testing", "validated", "applied"]);

type ChangeInEffect =
  | { ok: true; adaptationId: string; status: string }
  | { ok: false; summary: string; retryable?: boolean };

/** The named change, or the Flow's newest one still in effect. */
async function changeInEffect(
  transport: PanelCapabilityContext["transport"],
  projectId: string,
  flowId: string,
  adaptationId: string
): Promise<ChangeInEffect> {
  const listed = await listFlowAdaptations(transport, { projectId, flowId, sort: "updated", direction: "desc", limit: 50, offset: 0 });
  if (!listed.ok) {
    const retryable = (listed as { retryable?: boolean }).retryable === true;
    return { ok: false, summary: "The Flow's changes could not be read, so nothing was rolled back.", ...(retryable ? { retryable } : {}) };
  }
  const changes: Array<{ adaptationId?: unknown; status?: unknown }> = listed.payload?.adaptations ?? listed.payload?.page?.adaptations ?? [];
  const change = adaptationId
    ? changes.find((entry) => entry.adaptationId === adaptationId)
    : changes.find((entry) => typeof entry.status === "string" && IN_EFFECT.has(entry.status));
  if (change && typeof change.adaptationId === "string") return { ok: true, adaptationId: change.adaptationId, status: String(change.status ?? "") };
  // A named change the listing did not return is still worth trying: the
  // review itself says whether it exists.
  if (adaptationId) return { ok: true, adaptationId, status: "" };
  return { ok: false, summary: "That Flow has no change from the model still in effect, so there is nothing to roll back." };
}
