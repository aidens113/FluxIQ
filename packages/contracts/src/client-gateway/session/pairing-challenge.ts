export type ClientGatewayPairingChallenge = {
  pairingCode: string;
  referenceCode?: string;
  projectId?: string | null;
  userId?: string;
  requestedAt?: number;
  requestedBySessionId?: string;
  requestedByClientId?: string;
  requestedByClientName?: string;
  expiresAt: number;
  consumedAt?: number;
  sessionId?: string;
};
