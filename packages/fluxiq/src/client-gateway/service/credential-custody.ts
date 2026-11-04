import type { ClientGatewayAuditLog } from "./audit-log.ts";

/** A trusted client as custody needs it: who it acts for, until when, and what to call it. No credential. */
export type ClientGatewayCredentialHolder = {
  trustedClientId: string;
  userId: string;
  expiresAtMs: number;
  name: string;
};

/**
 * Who keeps something for a client's credential, told of each moment the gateway
 * handles one. The gateway owns the credential and verifies it; custody decides
 * what it opens. Only a credential the gateway has verified reaches `issued`,
 * `confirmed`, `rotating` or `presented`, and the gateway never logs one.
 */
export type ClientGatewayCredentialCustody = {
  /** A person approved this client, in `approvedBySessionId` when the caller knows it. */
  issued(input: { holder: ClientGatewayCredentialHolder; credential: string; approvedBySessionId?: string | undefined }): Promise<void>;
  /** A credential is confirmed in use, so what any other could open ends: `credential` names it, or, absent, the client said it stored the newest. */
  confirmed(input: { holder: ClientGatewayCredentialHolder; credential?: string | undefined }): Promise<void>;
  /** Written ahead of the new credential's digest, so a crash either side of it leaves the accepted credential able to open what custody keeps. */
  rotating(input: { holder: ClientGatewayCredentialHolder; previousCredential: string; nextCredential: string }): Promise<void>;
  /** The client spoke with this credential: a socket's hello or a request's bearer token. Called on every request, so it must be cheap when nothing changed. */
  presented(input: { holder: ClientGatewayCredentialHolder; credential: string }): Promise<void>;
  /** The client's last socket went away; its credential can come back. */
  released(trustedClientId: string): void;
  /** Its trust ended, and nothing it kept may be opened again. */
  forgotten(trustedClientId: string): Promise<void>;
};

/**
 * Custody as the gateway calls it: optional, and never able to fail what the
 * gateway was doing. A client whose custody failed is still paired, and finds its
 * key locked, which it says. A failure is audited by step and error name only,
 * because a store's message could quote what it was writing.
 */
export class ClientGatewayCredentialCustodian {
  private readonly custody: ClientGatewayCredentialCustody | undefined;
  private readonly audit: ClientGatewayAuditLog;

  constructor(custody: ClientGatewayCredentialCustody | undefined, audit: ClientGatewayAuditLog) {
    this.custody = custody;
    this.audit = audit;
  }

  async issued(input: Parameters<ClientGatewayCredentialCustody["issued"]>[0]): Promise<void> {
    await this.guarded("issued", input.holder.trustedClientId, async (custody) => custody.issued(input));
  }

  async confirmed(input: Parameters<ClientGatewayCredentialCustody["confirmed"]>[0]): Promise<void> {
    await this.guarded("confirmed", input.holder.trustedClientId, async (custody) => custody.confirmed(input));
  }

  async rotating(input: Parameters<ClientGatewayCredentialCustody["rotating"]>[0]): Promise<void> {
    await this.guarded("rotating", input.holder.trustedClientId, async (custody) => custody.rotating(input));
  }

  async presented(input: Parameters<ClientGatewayCredentialCustody["presented"]>[0]): Promise<void> {
    await this.guarded("presented", input.holder.trustedClientId, async (custody) => custody.presented(input));
  }

  released(trustedClientId: string): void {
    void this.guarded("released", trustedClientId, async (custody) => custody.released(trustedClientId));
  }

  async forgotten(trustedClientId: string): Promise<void> {
    await this.guarded("forgotten", trustedClientId, async (custody) => custody.forgotten(trustedClientId));
  }

  private async guarded(step: string, trustedClientId: string, work: (custody: ClientGatewayCredentialCustody) => Promise<void>): Promise<void> {
    if (!this.custody) return;
    try {
      await work(this.custody);
    } catch (error) {
      this.audit.record("credential_custody.failed", "Credential custody could not complete a step; the client's trust is unaffected.", { step, trustedClientId, error: error instanceof Error ? error.name : "non_error" });
    }
  }
}
