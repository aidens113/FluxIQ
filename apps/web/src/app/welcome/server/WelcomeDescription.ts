import type { PlatformStore } from "fluxiq/platform";
import type { AccountRole, WorkspaceKind } from "../../../features/accounts/model";

/** What the welcome page says before the person sets a password: the email they sign in with, the role they get, and the kind of workspace they join. */
export type WelcomeInvitation = { email: string; role: AccountRole; workspaceKind: WorkspaceKind };

/** The describe route's answer: the invitation, or one refusal code for every bad link. Never the token. */
export type WelcomeDescription = { status: number; body: { ok: true; invitation: WelcomeInvitation } | { ok: false; code: string } };

/** What describing a link reads: the platform store, and the clock the link's expiry is judged by. */
export type WelcomeDescribeDeps = {
  store: Pick<PlatformStore, "getLinkToken" | "getAccount" | "listMembershipsOfUser" | "getWorkspace">;
  now(): number;
};
