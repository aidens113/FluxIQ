import type { ClientGatewayTrustedClient } from "@fluxiq/contracts/client-gateway";
import { ClientTrustConflictError } from "../model/index.ts";
import type { ClientTrustBinding } from "../model/index.ts";
import type { ClientTrustDatabase } from "./database.ts";
import { validateClientTrustRecord } from "./validate-client.ts";

type TrustRow = {
  trustedClientId: string;
  workspaceId: string;
  clientJson: string;
  tokenHash: string;
  previousTokenHash: string | null;
  present: number;
};

const COLUMNS = "trusted_client_id as trustedClientId, workspace_id as workspaceId, client_json as clientJson, token_hash as tokenHash, previous_token_hash as previousTokenHash, present";

/** All record operations run inside their caller's mandatory transaction. */
export class ClientTrustRecords {
  private readonly db: ClientTrustDatabase;

  constructor(db: ClientTrustDatabase) {
    this.db = db;
  }

  async load(workspaceId: string): Promise<{ generation: number; clients: ClientGatewayTrustedClient[] }> {
    const snapshot = await this.db.get<{ generation: number }>("select generation from browser_trust_workspaces where workspace_id = ?", [workspaceId]);
    const generation = snapshot?.generation ?? 0;
    if (!Number.isSafeInteger(generation) || generation < 0) throw new Error("Browser trust workspace generation is invalid.");
    const rows = await this.db.all<TrustRow>(`select ${COLUMNS} from browser_trust_records where workspace_id = ? and present = 1 order by trusted_client_id`, [workspaceId]);
    return { generation, clients: rows.map(readClient) };
  }

  async replace(workspaceId: string, generation: number, clients: ClientGatewayTrustedClient[], now: number): Promise<number> {
    if (!Number.isSafeInteger(generation) || generation < 0 || generation >= Number.MAX_SAFE_INTEGER) throw new Error("Browser trust workspace generation is invalid.");
    await this.db.run("insert into browser_trust_workspaces (workspace_id, generation) values (?, 0) on conflict(workspace_id) do nothing", [workspaceId]);
    const changed = await this.db.run("update browser_trust_workspaces set generation = generation + 1 where workspace_id = ? and generation = ?", [workspaceId, generation]);
    if (changed !== 1) throw new ClientTrustConflictError("stale-generation");
    const incoming = new Set<string>();
    for (const client of clients) {
      if (incoming.has(client.trustedClientId)) throw new TypeError("Duplicate browser trust record.");
      incoming.add(client.trustedClientId);
      await this.put(workspaceId, client);
    }
    const rows = await this.db.all<TrustRow>(`select ${COLUMNS} from browser_trust_records where workspace_id = ? and present = 1`, [workspaceId]);
    for (const row of rows) {
      if (incoming.has(row.trustedClientId)) continue;
      const client = readClient(row);
      if (client.revokedAt === undefined) {
        client.revokedAt = now;
        client.revocationReason = "removed from workspace trusted-client store";
        client.updatedAt = now;
      }
      await this.db.run("update browser_trust_records set client_json = ?, present = 0 where trusted_client_id = ? and workspace_id = ?", [JSON.stringify(client), client.trustedClientId, workspaceId]);
    }
    return generation + 1;
  }

  async candidates(tokenHash: string, trustedClientId: string | undefined): Promise<Array<{ workspaceId: string; client: ClientGatewayTrustedClient }>> {
    const rows = await this.db.all<TrustRow>(`select ${COLUMNS} from browser_trust_records where trusted_client_id = ? or token_hash = ? or previous_token_hash = ?`, [trustedClientId ?? null, tokenHash, tokenHash]);
    return rows.map((row) => ({ workspaceId: row.workspaceId, client: readClient(row) }));
  }

  async countActiveForUser(userId: string, now: number, replacement?: { workspaceId: string; clientId: string; clientInstallId: string }): Promise<number> {
    const rows = await this.db.all<TrustRow>(`select ${COLUMNS} from browser_trust_records where present = 1 and json_extract(client_json, '$.approvedByUserId') = ?`, [userId]);
    return rows.filter((row) => {
      const client = readClient(row);
      if (client.managedHost || client.revokedAt !== undefined || client.expiresAt <= now) return false;
      return !(replacement && row.workspaceId === replacement.workspaceId && client.clientId === replacement.clientId && client.clientInstallId === replacement.clientInstallId);
    }).length;
  }

  /** One person's current ordinary clients across every workspace, as bindings: what `countActiveForUser` counts, without the replacement rule. */
  async listActiveForUser(userId: string, now: number): Promise<ClientTrustBinding[]> {
    const rows = await this.db.all<TrustRow>(`select ${COLUMNS} from browser_trust_records where present = 1 and json_extract(client_json, '$.approvedByUserId') = ? order by workspace_id, trusted_client_id`, [userId]);
    const bindings: ClientTrustBinding[] = [];
    for (const row of rows) {
      const client = readClient(row);
      if (client.managedHost || client.revokedAt !== undefined || client.expiresAt <= now || client.approvedByUserId !== userId) continue;
      const binding: ClientTrustBinding = { workspaceId: row.workspaceId, trustedClientId: client.trustedClientId, approvedByUserId: client.approvedByUserId, clientId: client.clientId, clientType: client.clientType };
      if (client.domainId !== undefined) binding.domainId = client.domainId;
      bindings.push(binding);
    }
    return bindings;
  }

  private async put(workspaceId: string, client: ClientGatewayTrustedClient): Promise<void> {
    const row = await this.db.get<TrustRow>(`select ${COLUMNS} from browser_trust_records where trusted_client_id = ?`, [client.trustedClientId]);
    if (row) {
      if (row.workspaceId !== workspaceId) throw new ClientTrustConflictError("workspace-rebound");
      const previous = readClient(row);
      if (row.present !== 1) throw new ClientTrustConflictError("removed-trust");
      if (!sameBinding(previous, client)) throw new ClientTrustConflictError("trust-rebound");
      if (previous.revokedAt !== undefined && client.revokedAt === undefined) throw new ClientTrustConflictError("revoked-trust");
    }
    for (const hash of new Set([client.tokenHash, client.previousTokenHash].filter((hash): hash is string => hash !== undefined))) {
      const owner = await this.db.get<{ trustedClientId: string }>("select trusted_client_id as trustedClientId from browser_trust_records where (token_hash = ? or previous_token_hash = ?) and trusted_client_id <> ? limit 1", [hash, hash, client.trustedClientId]);
      if (owner) throw new ClientTrustConflictError("credential-rebound");
    }
    await this.db.run(`insert into browser_trust_records (trusted_client_id, workspace_id, client_json, token_hash, previous_token_hash, present)
      values (?, ?, ?, ?, ?, 1) on conflict(trusted_client_id) do update set client_json = excluded.client_json, token_hash = excluded.token_hash, previous_token_hash = excluded.previous_token_hash`, [client.trustedClientId, workspaceId, JSON.stringify(client), client.tokenHash, client.previousTokenHash ?? null]);
  }
}

function readClient(row: TrustRow): ClientGatewayTrustedClient {
  const client: unknown = JSON.parse(row.clientJson);
  validateClientTrustRecord(client);
  if (row.trustedClientId !== client.trustedClientId || row.tokenHash !== client.tokenHash || row.previousTokenHash !== (client.previousTokenHash ?? null) || !row.workspaceId || (row.present !== 0 && row.present !== 1) || (row.present === 0 && client.revokedAt === undefined)) throw new Error("Browser trust authority is inconsistent.");
  return client;
}

function sameBinding(before: ClientGatewayTrustedClient, after: ClientGatewayTrustedClient): boolean {
  return before.clientId === after.clientId && before.clientType === after.clientType && before.approvedByUserId === after.approvedByUserId && before.domainId === after.domainId && before.clientInstallId === after.clientInstallId && before.approvingSessionDigest === after.approvingSessionDigest && before.managedHost?.hostId === after.managedHost?.hostId && before.managedHost?.profile === after.managedHost?.profile && (before.reuseKey === undefined || before.reuseKey === after.reuseKey);
}
