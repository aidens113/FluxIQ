/**
 * The managed host a trust was enrolled for: `hostId` names the host the engine
 * launched, and `profile` says whether its browser profile is thrown away when
 * it closes (`fresh`, whose trust is revoked then and at the next engine start)
 * or kept (`named`).
 */
export type ClientGatewayManagedHost = {
  hostId: string;
  profile: "fresh" | "named";
};
