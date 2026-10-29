import { pairedClientActor } from "../program-route";
import type { AppRouteActor } from "./types";

type PairedSession = Parameters<typeof pairedClientActor>[0];
type IdentityDirectory = Parameters<typeof pairedClientActor>[1];

/**
 * The actor of a paired client's token call on an app route: the person who
 * approved the pairing, narrowed as on the program route (`pairedClientActor`).
 * Null when that person is gone, disabled or roleless, which the route answers
 * as an unauthenticated token.
 */
export async function pairedClientRouteActor(identityAccess: { snapshot(): Promise<IdentityDirectory> }, session: PairedSession): Promise<AppRouteActor | null> {
  return pairedClientActor<AppRouteActor["permissions"][number]>(session, await identityAccess.snapshot());
}
