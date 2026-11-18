import { pairedClientActor } from "../program-route";
import type { AppRouteActor } from "./types";

type PairedSession = Parameters<typeof pairedClientActor>[0];
type IdentityDirectory = Parameters<typeof pairedClientActor>[1];
type Permission = AppRouteActor["permissions"][number];

/**
 * What a paired client may carry on an app route. The program route's paired
 * cap also holds `secrets.manage`, for the three model-key writes its own
 * allowlist names (t928); no app route a paired client may call needs it, so
 * it stops here instead of riding along unused. `tests/contracts.test.ts`
 * fails if a route accepting `paired-client` ever asks for more than this set.
 */
export const APP_ROUTE_PAIRED_CLIENT_PERMISSIONS: readonly Permission[] = ["programs.read", "programs.write", "runtime.control", "flows.write"];

/**
 * The actor of a paired client's token call on an app route: the person who
 * approved the pairing, narrowed as on the program route (`pairedClientActor`)
 * and then to `APP_ROUTE_PAIRED_CLIENT_PERMISSIONS`. Null when that person is
 * gone, disabled or roleless, which the route answers as an unauthenticated
 * token.
 */
export async function pairedClientRouteActor(identityAccess: { snapshot(): Promise<IdentityDirectory> }, session: PairedSession): Promise<AppRouteActor | null> {
  const actor = pairedClientActor<Permission>(session, await identityAccess.snapshot());
  if (actor === null) return null;
  return { ...actor, permissions: actor.permissions.filter((permission) => APP_ROUTE_PAIRED_CLIENT_PERMISSIONS.includes(permission)) };
}
