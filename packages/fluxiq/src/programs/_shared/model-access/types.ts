import type { ModelAccessState } from "@fluxiq/contracts/platform";
import type { ClientGatewayService } from "../../../client-gateway/index.ts";
import type { GlobalProgramApiRegistry } from "../api.ts";

/** Something that tells of a change, naming nothing; `subscribe` answers what stops it. */
export type ModelAccessChangeSource = { subscribe(listener: () => void): () => void };

/**
 * Says "a person's model access may have changed", naming nothing: a key or a
 * model-key choice changed, a key's last-call or check outcome changed, or the
 * people or IAM that decide who may be told changed. The panel's change stream
 * reads it from the runtime instance (`GlobalProgramRuntime.modelAccessChanges`)
 * and sends `event: model-access`.
 */
export type GlobalProgramModelAccessChanges = ModelAccessChangeSource;

/** The people and roles, with each role's permissions, as the paired program route reads them. */
export type ModelAccessPushDirectory = {
  users: ReadonlyArray<{ id: string; roleId: string; enabled: boolean }>;
  roles: ReadonlyArray<{ id: string; permissions: readonly string[] }>;
};

/** The people and roles a paired session's person is read from, and what tells of their change: the shape the paired program route reads. */
export type ModelAccessPushIdentity = {
  snapshot(): Promise<ModelAccessPushDirectory>;
  readonly directoryChanges: ModelAccessChangeSource;
};

/** The registry the push asks, as the snapshot endpoint registered it, whether a recipient may read their model access (`./recipient-decision.ts`). */
export type ModelAccessPushRegistry = Pick<GlobalProgramApiRegistry, "decideUnrecorded" | "endpoints">;

/** What `installModelAccessPush` wires together (`./push.ts`). */
export type ModelAccessPushDependencies = {
  /** The registry whose IAM decides each recipient exactly as it decides the Secret Keys snapshot (F4). */
  readonly registry: ModelAccessPushRegistry;
  /** The gateway's port; the push installs its authority there and publishes on each change. */
  readonly gateway: Pick<ClientGatewayService["modelAccessPush"], "setAuthority" | "publish">;
  /** Every change that may change someone's model access (Secret Keys' committed changes, the ledger, IAM decisions). */
  readonly sources: ReadonlyArray<ModelAccessChangeSource>;
  /** The identity the paired program route reads people from, as it stands at each read; its directory changes are watched too. */
  readonly identity: () => Promise<ModelAccessPushIdentity>;
  /**
   * A paired session's person's model access, exactly as the Secret Keys
   * snapshot answers that person on that session (`sessionId` is the
   * gateway's own session id). Asked only when IAM lets that session read the
   * snapshot (`modelAccessRecipientAllowed`).
   */
  readonly stateOf: (subject: { sessionId: string; userId: string }) => Promise<ModelAccessState>;
};

/** What `installModelAccessPush` answers: the panel's signal, and what undoes everything it installed. */
export type ModelAccessPush = {
  readonly changes: GlobalProgramModelAccessChanges;
  stop(): void;
};
