// What a turn's attachment reference resolves to, for the kinds Core can serve.
//
// A kind with nothing behind it is refused in the same words the collaborator
// uses with no resolver at all, so a reader can tell "shows nothing" from "shows
// something this deployment cannot fetch" (`../conversations.ts`).

import type { AutomationStudioConversationAttachmentResolver } from "../conversations.ts";
import { AUTOMATION_STUDIO_PANEL_CAPABILITY_RESULT_ATTACHMENT } from "../instructions/index.ts";
import { AUTOMATION_STUDIO_FLOW_GRAPH_DIFF_ATTACHMENT, automationStudioFlowGraphDiff, type AutomationStudioFlowGraphDiffReads } from "./flow-graph-diff.ts";

/** What the resolver reads. The Automation Studio service has these itself. */
export type AutomationStudioConversationAttachmentReads = AutomationStudioFlowGraphDiffReads;

export function automationStudioConversationAttachmentResolver(reads: AutomationStudioConversationAttachmentReads): AutomationStudioConversationAttachmentResolver {
  return async ({ projectId, attachment }) => {
    if (attachment.kind === AUTOMATION_STUDIO_FLOW_GRAPH_DIFF_ATTACHMENT) return await automationStudioFlowGraphDiff(reads, projectId, attachment.ref);
    // The turn's own words say what the capability did; the reference names which one ran.
    if (attachment.kind === AUTOMATION_STUDIO_PANEL_CAPABILITY_RESULT_ATTACHMENT) return { capabilityId: attachment.ref };
    throw new Error(`This deployment cannot serve a conversation attachment of kind ${attachment.kind}.`);
  };
}
