import type { AutomationStudioConversationSignalScope } from "fluxiq/automation";
import type { WorkspaceRouteCaller, WorkspaceRouteContext } from "../../../../lib/workspaces";

const PROGRAM = "automation-studio";

/** Deciding whether a caller may read something failed: the stream fails rather than drop a change it could not decide. */
export class PanelChangeAuthorityUnavailable extends Error {
  constructor() {
    super("Request authority could not be verified.");
    this.name = "PanelChangeAuthorityUnavailable";
  }
}

export type PanelChangeReads = {
  /** Whether the caller may read a thread that lives in `scope`, decided as reading it is. */
  conversation(scope: AutomationStudioConversationSignalScope): Promise<boolean>;
  /** Whether project `projectId` is this workspace's and the caller may read its live activity, decided as `get-activity` is. */
  activity(projectId: string): Promise<boolean>;
  /** Stops listening for IAM changes; the stream calls it when it ends. */
  stop(): void;
};

/**
 * What one panel caller of the change stream may hear of, decided exactly as
 * the reads it will make are decided, so a caller is never told of a thread
 * or a project it could not read:
 *
 * - a project's thread: `studio:GetConversation` on the project
 *   (`get-conversation`'s own action and resource), and the project in the
 *   caller's domain scope (`assertProjectDomainAccess`, as that handler does);
 * - a panel thread: only the person whose thread it is, and
 *   `studio:GetPanelThread` on their own user (`get-panel-thread`);
 * - a project's activity: only a project the selected workspace's own
 *   catalogue holds (`projects.held`), since the activity hub is process-wide
 *   and one process may run several tenants' runtimes; then
 *   `studio:GetActivity` on the project (`get-activity`, which asserts no
 *   domain and answers another workspace's project as an unknown one).
 *
 * The tenant is the workspace the route selected: its own registry decides,
 * its own Core signals threads, and its own catalogue says which activity is
 * its, so another workspace's thread or project never reaches here, whatever
 * the caller's policy grants.
 * Decisions are unrecorded (`decideUnrecorded`), since one is reused for every
 * signal about the same project, and they are forgotten whenever IAM says a
 * decision may have changed. A paired client is told of none of these: its
 * threads and activity reach it over the gateway socket.
 */
export function panelChangeReads(input: { owner: WorkspaceRouteContext; caller: WorkspaceRouteCaller; domainId: string | null }): PanelChangeReads {
  const { owner, caller, domainId } = input;
  const api = owner.fluxiq.programs.api;
  const decided = new Map<string, Promise<boolean>>();
  const stopListening = api.subscribeDecisionChanges(() => decided.clear());

  const remembered = (key: string, decide: () => Promise<boolean>): Promise<boolean> => {
    const known = decided.get(key);
    if (known) return known;
    const deciding = decide();
    decided.set(key, deciding);
    // A decision that could not be made is not remembered: the next signal decides again.
    deciding.catch(() => {
      if (decided.get(key) === deciding) decided.delete(key);
    });
    return deciding;
  };

  const allowed = async (action: string, resources: { kind: "project"; projectId: string } | { kind: "user"; self: true }): Promise<boolean> => {
    const result = await api.decideUnrecorded({ actor: { ...caller.actor, channel: caller.channel }, action, permission: "programs.read", resources, programId: PROGRAM });
    if (result.allowed) return true;
    if (result.response.errorCode === "authorization.forbidden" && result.decision?.failure !== "policy_unavailable") return false;
    throw new PanelChangeAuthorityUnavailable();
  };

  // Rejects when the catalogue cannot be read: the stream fails rather than guess.
  const held = (projectId: string): Promise<boolean> => owner.fluxiq.programs.automationStudio.projects.held.holds(projectId);

  const inDomain = async (projectId: string): Promise<boolean> => {
    try {
      await owner.fluxiq.programs.automationStudio.assertProjectDomainAccess(projectId, domainId);
      return true;
    } catch {
      // Outside the caller's domain, or no such project: `get-conversation` would refuse it too.
      return false;
    }
  };

  return {
    conversation(scope) {
      if (caller.channel !== "panel") return Promise.resolve(false);
      if (scope.kind === "panel") {
        if (scope.userId !== caller.binding.userId) return Promise.resolve(false);
        return remembered("panel-thread", () => allowed("studio:GetPanelThread", { kind: "user", self: true }));
      }
      const projectId = scope.projectId;
      return remembered(`conversation:${projectId}`, async () => await allowed("studio:GetConversation", { kind: "project", projectId }) && await inDomain(projectId));
    },
    activity(projectId) {
      if (caller.channel !== "panel") return Promise.resolve(false);
      // Held first: another workspace's project id is never put to this workspace's IAM at all.
      return remembered(`activity:${projectId}`, async () => await held(projectId) && await allowed("studio:GetActivity", { kind: "project", projectId }));
    },
    stop() {
      stopListening();
      decided.clear();
    }
  };
}
