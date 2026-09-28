// Versions, and undoing a change that made a Flow worse.
//
// `version.rollBack` is the one a person reaches for when the model has just
// ruined something, so it takes the words they would actually use -- "undo
// that", "put it back", "that made it worse" -- rather than the word the
// panel uses on the button.

import { reviewFlowAdaptation } from "../../../adaptations";
import { AUTOMATION_FLOW_ENDPOINTS } from "../../../flow-editor";
import { automationStudioViewId } from "../../../views";
import { definePanelCapability, panelCapabilityResult, type PanelCapability } from "../contract";
import { PROJECT, FLOW, PIN } from "./argument";
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
      { name: "changelog", kind: "text", describe: "What changed.", required: false },
      PIN
    ],
    consequences: ["create_new"],
    invoke: async (context, args) => panelCapabilityResult(
      await context.transport.post(AUTOMATION_FLOW_ENDPOINTS.publish, {
        projectId: str(args, "projectId"),
        flowId: str(args, "flowId"),
        version: str(args, "version"),
        changelog: str(args, "changelog"),
        publishedBy: "conversation",
        authorizationPin: str(args, "authorizationPin")
      }),
      "Published the version.",
      "The version could not be published."
    )
  }),
  definePanelCapability({
    id: "version.rollBack",
    title: "Roll a change back",
    summary: "Rejects a change the model made to the Flow, putting it back the way it was before.",
    group: "Versions",
    phrases: ["roll it back", "undo that", "revert the change", "put it back", "reject the change", "that made it worse"],
    control: { view: automationStudioViewId.adaptations, label: "Reject change" },
    endpoints: ["review-flow-adaptation"],
    arguments: [
      PROJECT,
      { name: "adaptationId", kind: "id", describe: "The change to roll back.", required: true },
      { name: "reason", kind: "text", describe: "Why it is being rolled back.", required: false }
    ],
    consequences: ["modify_existing"],
    invoke: async (context, args) => panelCapabilityResult(
      await reviewFlowAdaptation(context.transport, {
        projectId: str(args, "projectId"),
        adaptationId: str(args, "adaptationId"),
        decision: "rejected",
        reason: args.reason ? str(args, "reason") : "Rolled back from the conversation."
      }),
      "Rolled the change back.",
      "The change could not be rolled back."
    )
  }),
  definePanelCapability({
    id: "version.accept",
    title: "Accept a change the model made",
    summary: "Approves a change the model proposed, so the Flow keeps it.",
    group: "Versions",
    phrases: ["accept it", "approve the change", "keep that", "that is better"],
    control: { view: automationStudioViewId.adaptations, label: "Accept change" },
    endpoints: ["review-flow-adaptation"],
    arguments: [PROJECT, { name: "adaptationId", kind: "id", describe: "The change to accept.", required: true }],
    consequences: ["modify_existing"],
    invoke: async (context, args) => panelCapabilityResult(
      await reviewFlowAdaptation(context.transport, { projectId: str(args, "projectId"), adaptationId: str(args, "adaptationId"), decision: "approved" }),
      "Kept the change.",
      "The change could not be accepted."
    )
  }),
  definePanelCapability({
    id: "version.deprecate",
    title: "Take a published version out of service",
    summary: "Marks a published version as no longer to be used. Asks for your PIN first.",
    group: "Versions",
    phrases: ["deprecate", "retire the version", "stop using that version"],
    control: { view: automationStudioViewId.settings, label: "Deprecate" },
    endpoints: [AUTOMATION_FLOW_ENDPOINTS.deprecate],
    arguments: [
      PROJECT,
      FLOW,
      { name: "version", kind: "text", describe: "The version to retire.", required: true },
      { name: "reason", kind: "text", describe: "Why it is being retired.", required: true },
      PIN
    ],
    consequences: ["modify_existing"],
    invoke: async (context, args) => panelCapabilityResult(
      await context.transport.post(AUTOMATION_FLOW_ENDPOINTS.deprecate, {
        projectId: str(args, "projectId"),
        flowId: str(args, "flowId"),
        version: str(args, "version"),
        reason: str(args, "reason"),
        authorizationPin: str(args, "authorizationPin")
      }),
      "Took the version out of service.",
      "The version could not be retired."
    )
  })
];
