import type { AccountRole, WorkspaceKind } from "../../../features/accounts/model";

export type WelcomeLinkAnswer =
  | { ok: true; invitation: { email: string; role: AccountRole; workspaceKind: WorkspaceKind } }
  | { ok: false; code: string };

const ROLES = new Set<string>(["owner", "administrator", "read-only", "member", "other"]);
const KINDS = new Set<string>(["single", "personal", "organisation"]);

/** Asks what a welcome link is for, without spending it. The token is posted, never put in a URL; a network failure is `unreachable`. */
export async function describeWelcomeLink(token: string): Promise<WelcomeLinkAnswer> {
  try {
    const response = await fetch("/welcome/describe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }), cache: "no-store" });
    const answer = (await response.json()) as { ok?: unknown; code?: unknown; invitation?: { email?: unknown; role?: unknown; workspaceKind?: unknown } };
    if (!response.ok || answer.ok !== true) return { ok: false, code: typeof answer.code === "string" ? answer.code : "failed" };
    const invitation = answer.invitation ?? {};
    return {
      ok: true,
      invitation: {
        email: typeof invitation.email === "string" ? invitation.email : "",
        role: typeof invitation.role === "string" && ROLES.has(invitation.role) ? (invitation.role as AccountRole) : "other",
        workspaceKind: typeof invitation.workspaceKind === "string" && KINDS.has(invitation.workspaceKind) ? (invitation.workspaceKind as WorkspaceKind) : "single"
      }
    };
  } catch {
    return { ok: false, code: "unreachable" };
  }
}
