// The shapes this directory's authorities read and install through: the
// approving person's identity source, what tells of a change, and where the
// authorities are installed (`./authority.ts`, `./paired-read.ts`).

import type { ClientGatewayService } from "../../../../client-gateway/index.ts";
import type { AutomationStudioService } from "../../../../framework/automation-service/index.ts";
import type { GlobalProgramApiRegistry } from "../../../_shared/api.ts";

/** Something that tells of a change (`AutomationStudioProjectRemovals`, `IdentityDirectoryChanges`); `subscribe` returns what stops it. */
export type PairedProjectFocusChangeSource = { subscribe(listener: () => void): () => void };

/** The people and roles the approving person is read from, and what tells of their change; the shape the program route's identity authority answers. */
export type PairedProjectFocusIdentity = {
  snapshot(): Promise<{
    users: ReadonlyArray<{ id: string; roleId: string; enabled: boolean }>;
    roles: ReadonlyArray<{ id: string; permissions: readonly string[] }>;
  }>;
  readonly directoryChanges: PairedProjectFocusChangeSource;
};

/** What the authorities read: the registry's IAM, the project's domain, the person, and where they are installed. */
export type PairedProjectFocusDependencies = {
  readonly registry: Pick<GlobalProgramApiRegistry, "decideUnrecorded" | "subscribeDecisionChanges" | "endpoints">;
  readonly service: Pick<AutomationStudioService, "assertProjectDomainAccess"> & { readonly projects: { readonly removals: PairedProjectFocusChangeSource } };
  /** The identity source the paired program route reads people from, as it stands at each decision. */
  readonly identity: (() => Promise<PairedProjectFocusIdentity>) | undefined;
  /** Where the authorities are installed: the focus port, and the conversation push port's installer alone. */
  readonly clientGateway: { readonly projectFocus: ClientGatewayService["projectFocus"]; readonly conversationPush: Pick<ClientGatewayService["conversationPush"], "setAuthority"> } | undefined;
};
