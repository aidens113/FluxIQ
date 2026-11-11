import type { ClientGatewayManagedHost } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayEnrolmentRefusalCode } from "./enrolment-refusal.ts";

/**
 * What an enrolment ticket is minted for: the managed host it enrols, the
 * domain that host's client must declare, whether its profile is thrown away
 * on close, and how long the ticket lives (60 s when omitted).
 */
export type ClientGatewayHostEnrolmentRequest = {
  hostId: string;
  domainId: string;
  profile: ClientGatewayManagedHost["profile"];
  ttlMs?: number;
};

/**
 * A minted ticket. `ticket` is a credential: it is handed to the launcher in
 * memory only, and never logged, printed, persisted or put in a status.
 */
export type ClientGatewayHostEnrolmentTicket = {
  ticket: string;
  expiresAt: number;
};

/** What a redeemed ticket was bound to when it was minted. */
export type ClientGatewayHostEnrolmentBinding = {
  hostId: string;
  domainId: string;
  profile: ClientGatewayManagedHost["profile"];
};

/** What presenting a ticket came to: the binding it enrols, or the refusal and the host it named when Core knew the ticket. */
export type ClientGatewayHostEnrolmentRedemption =
  | { kind: "redeemed"; binding: ClientGatewayHostEnrolmentBinding }
  | { kind: "refused"; code: ClientGatewayEnrolmentRefusalCode; hostId?: string };

/**
 * What the engine does with managed hosts, from its own process: the gateway's
 * `managedHosts`. Nothing routes to it.
 */
export type ClientGatewayManagedHosts = {
  /** Mints the host's one live enrolment ticket, revoking any it had. The ticket is a credential: hand it over in memory and never log it. */
  issueHostEnrolment(input: ClientGatewayHostEnrolmentRequest): ClientGatewayHostEnrolmentTicket;
  /** Ends a managed host: its live ticket and every active trust enrolled for it, whose sessions are told and closed. Answers how many trusts ended. */
  revokeManagedHost(hostId: string, reason?: string): Promise<number>;
  /** At engine start: ends every active trust of a fresh-profile host, whose profile went with the run before. Answers how many ended. */
  revokeStaleManagedHosts(): Promise<number>;
};
