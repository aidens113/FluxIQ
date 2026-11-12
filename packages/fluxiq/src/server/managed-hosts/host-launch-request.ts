/**
 * What the engine hands a host launcher for one managed browser host.
 *
 * `takeEnrolmentTicket` mints a one-time, short-lived enrolment ticket bound to
 * this `hostId` and the engine's web domain, inside the engine's own process.
 * Calling it again revokes the ticket it returned before, so a host has at most
 * one live ticket. The ticket is a credential: a launcher passes it to the
 * extension in memory only, and never logs it or puts it in a URL, a command
 * line, an environment variable or a file. `signal` aborts when the engine
 * stops; the launcher then closes the host.
 */
export type FluxIQHostLaunchRequest = {
  hostId: string;
  gatewayUrl: string;
  coreApiUrl: string;
  dataDir: string;
  profile: { kind: "fresh" } | { kind: "named"; name: string };
  headless: boolean;
  takeEnrolmentTicket(): string;
  signal: AbortSignal;
};
