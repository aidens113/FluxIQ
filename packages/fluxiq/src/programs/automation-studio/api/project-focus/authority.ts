// What decides what the person who paired a client may read through it, in the
// domain the client declared, installed on the client gateway:
//
// - the focus authority (`client-gateway/service/project-focus/focus.ts`):
//   asked when the client moves its session to a project
//   (`client.focus_project`) and before a project's `server.activity` first
//   reaches the session. It decides reading the project as the `projects`
//   listing does: its action on the workspace and on this one project, exactly
//   the two decisions a listing makes before it keeps the project
//   (`filterProgramList`), so a project the person may not read under their
//   policies, or the owner condition on the `service` profile, is refused;
// - the conversation read authority
//   (`client-gateway/service/project-focus/conversation-delivery.ts`): asked
//   before a project's `server.conversation_changed` first reaches the
//   session. It decides reading the project's chats as `get-conversation`
//   does: its action on that one project, the resource it registers
//   (`endpointResource.project()`). A person's panel thread is never asked
//   about, since no paired client may read one.
//
// Both are one decision (`./paired-read.ts`) for a different endpoint. The
// gateway reuses each decision until it is told access changed, so this
// installs both authorities again whenever what they decide from changes: the
// person's identity (their role or enabled flag, a role's permissions), the
// registry's decisions (an IAM store write in this workspace, a registration),
// or a project removed from the catalogue. The gateway holds no identity or
// IAM, so this is installed on it by the program runtime, where both live.

import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../api-contracts/automation.ts";
import { PairedAccessChangeWatch } from "./access-change-watch.ts";
import { pairedReadAuthority, type PairedReadEndpoint } from "./paired-read.ts";
import type { PairedProjectFocusDependencies } from "./types.ts";

/** Reading a project as the `projects` listing keeps it: on the workspace and on the project. */
const PROJECT_READ: PairedReadEndpoint = {
  endpoint: AUTOMATION_STUDIO_ENDPOINTS.projects,
  resources: (projectId) => [{ kind: "workspace" }, { kind: "project", projectId }]
};

/** Reading one of a project's chats as `get-conversation` decides it: on the project. */
const CONVERSATION_READ: PairedReadEndpoint = {
  endpoint: AUTOMATION_STUDIO_ENDPOINTS.getConversation,
  resources: (projectId) => [{ kind: "project", projectId }]
};

/**
 * Installs the focus authority and the conversation read authority on the
 * client gateway, and installs both again at each change of what they decide
 * from, which tells the gateway that the decisions it reuses are void
 * (`ClientGatewayProjectFocusPort.setAuthority`,
 * `ClientGatewayConversationPushPort.setAuthority`). Returns what stops
 * listening; the runtime calls it as it closes, since the host's identity
 * outlives a tenant's runtime. Without a gateway or an identity source there
 * is nothing to install.
 */
export function installPairedProjectFocus(dependencies: PairedProjectFocusDependencies): () => void {
  const { registry, service, identity, clientGateway } = dependencies;
  if (!clientGateway || !identity) return () => undefined;
  const changed = () => {
    clientGateway.projectFocus.setAuthority(focusAuthority);
    clientGateway.conversationPush.setAuthority(conversationAuthority);
  };
  const watch = new PairedAccessChangeWatch([registry.subscribeDecisionChanges(changed), service.projects.removals.subscribe(changed)], changed);
  const focusAuthority = pairedReadAuthority({ ...dependencies, identity }, watch, PROJECT_READ);
  const conversationAuthority = pairedReadAuthority({ ...dependencies, identity }, watch, CONVERSATION_READ);
  changed();
  return () => watch.stop();
}
