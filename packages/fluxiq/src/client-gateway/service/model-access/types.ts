import type { ModelAccessState } from "@fluxiq/contracts/platform";

/**
 * The person-paired session whose model access is asked for: its gateway
 * session, the trusted client that holds it, and the person who paired it
 * (`operatorUserId`). Only a ready, connected, person-paired session is ever
 * asked about (`../project-focus/person-paired.ts`).
 */
export type ClientGatewayModelAccessSubject = { sessionId: string; userId: string; trustedClientId: string };

/**
 * The person's current model access, worked out by the layer that owns keys,
 * identity and IAM, exactly as the Secret Keys snapshot would answer that
 * person on the paired-client channel; null sends nothing to that session. A
 * thrown error reads as "could not be read": nothing is sent, and it is
 * audited by its kind only. The gateway strips the key's id
 * (`pairedClientModelAccessState`) and validates the state
 * (`readModelAccessState`) before sending, whatever this answers.
 */
export type ClientGatewayModelAccessAuthority = (subject: ClientGatewayModelAccessSubject) => Promise<ModelAccessState | null> | ModelAccessState | null;

/** Telling paired clients their person's model access changed (`ClientGatewayService.modelAccessPush`, `./delivery.ts`). */
export type ClientGatewayModelAccessPushPort = {
  /**
   * Installs what works out a person's model access; undefined sends no
   * `server.model_access_changed` at all. Installing one sends nothing by
   * itself: call `publish()` once it is in place.
   */
  setAuthority(stateOf: ClientGatewayModelAccessAuthority | undefined): void;
  /**
   * "Model access may have changed": works the state out again for each
   * ready, connected, person-paired session and sends it to each one whose
   * state differs from the last one sent to it. Returns how many sessions it
   * was worked out for (or will be, behind a read already running).
   */
  publish(): number;
};
