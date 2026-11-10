import type { IamRequestConsent, IamRequestVia } from "../../../platform/iam/index.ts";
import type { ProgramApiActor } from "../api.ts";
import type { ProgramScope } from "../types.ts";

/**
 * What one press grant is bound to: the panel session it was minted for (held
 * only as a digest), the person (`actorId` is their user id), the endpoint it
 * confirms, and its payload, held as the digest of its canonical JSON
 * (`pressGrantPayloadDigest`).
 */
export type PressGrantBinding = {
  sessionId: string;
  actorId: string;
  programId: string;
  endpoint: string;
  payload: unknown;
};

/** A minted grant: the secret the person's page sends back once, and when it stops working (epoch milliseconds). */
export type PressGrantMinted = {
  grant: string;
  expiresAt: number;
};

/** How a `PressGrantStore` tells the time; tests pass a clock they move. */
export type PressGrantStoreOptions = {
  now?: () => number;
};

/**
 * A request to mint a grant for one destructive call, checked by
 * `GlobalProgramApiRegistry.mintPressGrant`: the person pressing (their own
 * request's actor, never `via: "assistant"`), and the call the press confirms.
 * `consent` is how the grant was earned: `press` for a press of Allow or a
 * page's button (the only value the page's mint endpoint sends), `words` when
 * server code found the person's own message clearly asked for exactly this
 * call. It is written to the mint's audit row and to the confirmed call's.
 */
export type PressGrantMintRequest = {
  actor: ProgramApiActor | undefined;
  via?: IamRequestVia | undefined;
  consent: IamRequestConsent;
  scope?: ProgramScope;
  programId: string;
  endpoint: string;
  payload?: unknown;
};
