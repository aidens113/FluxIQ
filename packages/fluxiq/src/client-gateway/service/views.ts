import type { ClientGatewaySnapshotView } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayAuditLog } from "./audit-log.ts";
import type { ClientGatewayConfig } from "./config.ts";
import type { ClientGatewayPairingRegistry } from "./pairings.ts";
import type { ClientGatewaySessionRegistry } from "./sessions.ts";
import type { ClientGatewayTrustedClientRegistry } from "./trusted-clients.ts";
import type { ClientGatewayItemKind, ClientGatewaySummaryItem, ClientGatewaySummaryPage } from "./types.ts";

const AUDIT_LOG_SNAPSHOT_ENTRIES = 100;
const MAX_SUMMARY_PAGE_SIZE = 200;
const DEFAULT_SUMMARY_PAGE_SIZE = 50;

type ViewCollaborators = {
  config: ClientGatewayConfig;
  sessions: ClientGatewaySessionRegistry;
  pairings: ClientGatewayPairingRegistry;
  trustedClients: ClientGatewayTrustedClientRegistry;
  audit: ClientGatewayAuditLog;
};

/**
 * Read-only projections of gateway state. Every one prunes expired pairings
 * first so a caller never sees a challenge that has already lapsed.
 */
export class ClientGatewayViews {
  private readonly config: ClientGatewayConfig;
  private readonly sessions: ClientGatewaySessionRegistry;
  private readonly pairings: ClientGatewayPairingRegistry;
  private readonly trustedClients: ClientGatewayTrustedClientRegistry;
  private readonly audit: ClientGatewayAuditLog;

  constructor(collaborators: ViewCollaborators) {
    this.config = collaborators.config;
    this.sessions = collaborators.sessions;
    this.pairings = collaborators.pairings;
    this.trustedClients = collaborators.trustedClients;
    this.audit = collaborators.audit;
  }

  snapshot(): ClientGatewaySnapshotView {
    this.pairings.pruneExpired();
    return {
      enabled: this.config.enabled,
      ...(this.config.publicUrl ? { publicUrl: this.config.publicUrl } : {}),
      sessions: this.sessions.list().map((session) => this.sessions.toPublic(session)),
      pairings: this.pairings.list(),
      trustedClients: this.trustedClients.list().map((client) => this.trustedClients.toView(client)),
      auditLog: this.audit.recent(AUDIT_LOG_SNAPSHOT_ENTRIES)
    };
  }

  summary(): { enabled: boolean; publicUrl?: string; counts: Record<ClientGatewayItemKind, number> } {
    this.pairings.pruneExpired();
    return {
      enabled: this.config.enabled,
      ...(this.config.publicUrl ? { publicUrl: this.config.publicUrl } : {}),
      counts: { sessions: this.sessions.size(), pairings: this.pairings.size(), trustedClients: this.trustedClients.size() }
    };
  }

  listSummaryItems(input: { kind: ClientGatewayItemKind; afterId?: string | null; limit?: number; search?: string }): ClientGatewaySummaryPage {
    this.pairings.pruneExpired();
    const idOf = this.identifier(input.kind);
    const source = this.sourceFor(input.kind);
    const search = input.search?.trim().toLowerCase() ?? "";
    const limit = Math.max(1, Math.min(MAX_SUMMARY_PAGE_SIZE, Math.trunc(input.limit ?? DEFAULT_SUMMARY_PAGE_SIZE) || DEFAULT_SUMMARY_PAGE_SIZE));
    const filtered = source.filter((item) => !search || Object.values(item).some((value) => typeof value === "string" && value.toLowerCase().includes(search)))
      .sort((left, right) => idOf(left).localeCompare(idOf(right)));
    const after = input.afterId ? filtered.filter((item) => idOf(item) > input.afterId!) : filtered;
    const items = after.slice(0, limit);
    return { items, total: filtered.length, limit, lastId: items.at(-1) ? idOf(items.at(-1)!) : null, hasMore: after.length > limit };
  }

  private identifier(kind: ClientGatewayItemKind): (item: ClientGatewaySummaryItem) => string {
    if (kind === "sessions") return (item) => (item as { sessionId: string }).sessionId;
    if (kind === "pairings") return (item) => (item as { pairingCode: string }).pairingCode;
    return (item) => (item as { trustedClientId: string }).trustedClientId;
  }

  private sourceFor(kind: ClientGatewayItemKind): ClientGatewaySummaryItem[] {
    if (kind === "sessions") return this.sessions.list().map((session) => this.sessions.toPublic(session));
    if (kind === "pairings") return this.pairings.list().map((pairing) => ({ ...pairing }));
    return this.trustedClients.list().map((client) => this.trustedClients.toView(client));
  }
}
