import type { ClientGatewaySession } from "../contracts.ts";

// The public service methods a collaborator is allowed to call back into.
//
// A collaborator must never reach these through the collaborator that owns
// them. They are public, so a caller can subclass the service or replace one on
// an instance, and code inside the object is expected to honour that. Routed
// straight at the owning collaborator the override is silently ignored -- a
// behaviour change no type check and no value-diffing test can see.
//
// Private methods carry no such contract, so a collaborator calls those
// directly on whichever collaborator owns them.
export type ClientGatewayFacadePorts = {
  ready(): Promise<void>;
  disconnect(sessionId: string, reason?: string): ClientGatewaySession | null;
};
