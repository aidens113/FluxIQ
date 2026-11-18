import type {
  ClientGatewayActionResult,
  ClientGatewayConversationChanged,
  ClientGatewayPairingChallenge,
  ClientGatewayServerMessage,
  ClientGatewaySession,
  ClientGatewaySocket,
  ClientGatewayTrustedClient,
  ClientGatewayTrustedClientView
} from "@fluxiq/contracts/client-gateway";

/** Durable store the gateway reads trusted clients from and writes them back to. */
export type ClientGatewayTrustedClientStore = {
  load(): Promise<ClientGatewayTrustedClient[]>;
  save(clients: ClientGatewayTrustedClient[]): Promise<void>;
};

/** Construction options for `ClientGatewayService`. */
export type ClientGatewayServiceOptions = {
  enabled?: boolean;
  publicUrl?: string;
  pairingTtlMs?: number;
  commandTimeoutMs?: number;
  /**
   * How long a client is given to answer what became of a command whose own
   * answer never came (`./command-reconcile/`), and how long a command it says
   * is still running is waited on before it is asked again. 5,000 ms.
   */
  reconcileAnswerMs?: number;
  /** How long a client's trust lasts from its last use. 60 days. */
  trustedClientTtlMs?: number;
  /** How long a credential stays valid while its replacement is unconfirmed (`./trusted-clients.ts`). 14 days. */
  credentialConfirmGraceMs?: number;
  /**
   * Caps on pairing challenges still waiting for approval
   * (`./security/pairing-limits.ts`): `total` 1,000 and `perAddress` off by
   * default. The transport may replace them at start through
   * `setPairingLimits`.
   */
  pairingLimits?: Partial<import("./security/index.ts").ClientGatewayPairingLimits>;
  /** How many ended sessions are kept before the oldest-disconnected is dropped (`./sessions.ts`). 1,000. */
  endedSessionLimit?: number;
  /** How long an ended session is kept; `null` keeps it while `endedSessionLimit` allows. Default `null`. */
  endedSessionMaxAgeMs?: number | null;
  /** How many audit entries the ring keeps before the oldest is overwritten (`./audit-log.ts`). 10,000. */
  auditLimit?: number;
  trustedClientStore?: ClientGatewayTrustedClientStore;
  /** Who keeps something for a client's credential, told of each moment one is handled (`./credential-custody.ts`). Unset, nothing is. */
  credentialCustody?: import("./credential-custody.ts").ClientGatewayCredentialCustody;
  /** Server-only authenticated issuance before a client socket exists. Unset, this path refuses all grants. */
  trustAuthority?: import("./trust-issuance/index.ts").ClientGatewayTrustAuthority;
  /** Server-owned current identity for ordinary trusted clients; omission preserves generic local behavior. */
  sessionMetadata?: import("./session-metadata/index.ts").ClientGatewaySessionMetadataProvider;
  createToken?: () => string;
  now?: () => number;
  resolveCommandLedger?: (context: import("./command-ledger/index.ts").ClientGatewayCommandContext) => Promise<import("./command-ledger/index.ts").ClientGatewayCommandLedgerLease>;
  /**
   * The run an action command is being sent for, read as the command is
   * dispatched, so a result that arrives after Core stopped waiting for it can
   * be put on that run's evidence (`./command-history.ts`). A durable command
   * names its run already; this is for the others. Unset, or answering
   * nothing, a late result is still kept from being applied, only unattributed.
   */
  commandOwner?: () => import("./command-history.ts").ClientGatewayCommandOwnerRef | undefined;
  /**
   * The host lease the dispatching async context runs under
   * (automation-project-agents-plan, `Host resources and concurrency`), read as
   * each action command is dispatched and stamped on it, as `commandOwner` is
   * read (`./host-lease/`). A command whose lease is stale or not its scope's
   * own is refused unsent. Unset, no command carries a lease and none is
   * refused for one.
   */
  hostLease?: import("./host-lease/index.ts").ClientGatewayHostLeaseSource | import("./host-lease/index.ts").ClientGatewayHostLeaseTargetSource;
  /**
   * The channel scope the dispatching async context runs in (traces and
   * offline trials, P1), read as `hostLease` is (`./channel-scope/`). Inside a
   * scope the session view shows, and commands reach, only the sessions
   * attached under it; outside every scope, only live sessions. Unset, every
   * caller is live, so a scoped session is never seen or reached.
   */
  channelScope?: import("./channel-scope/index.ts").ClientGatewayChannelScopeSource;
  /**
   * The trace the dispatching async context records into (traces and offline
   * trials, P2), read as `hostLease` is (`./trace-tap/`). What the gateway
   * sends under a trace is recorded into it, stamped for capture when it is an
   * action, and claims its session, so what that session sends back is
   * recorded too. Unset, or answering nothing, nothing is captured or stamped.
   */
  trace?: import("../trace/index.ts").ClientGatewayTraceCaptureSource;
  /**
   * Mints the ids the gateway itself gives out: server message ids, action
   * command ids (a durable command's id comes from its run binding instead),
   * ping nonces and a scoped session's client id. A replay hands back the ids
   * its recording holds, so what it sends compares byte for byte. Unset:
   * `randomUUID()`.
   */
  createId?: (kind: ClientGatewayIdKind) => string;
  /**
   * Starts each wait the gateway runs out on its own: a command's answer wait
   * (`./commands.ts`, `./command-ledger/dispatch.ts`). A replay runs out
   * exactly the waits its recording shows ran out, when it shows. Unset:
   * `setTimeout`.
   */
  startTimer?: ClientGatewayTimerSource;
  /**
   * Decides a `client.focus_project` (`./project-focus/`); a host may also
   * install it later through `ClientGatewayService.projectFocus`.
   * Unset, every focus to a project is refused as `project_focus.unavailable`.
   */
  projectFocusAuthority?: ClientGatewayProjectFocusAuthority;
};

/** What the gateway is minting an id for (`ClientGatewayServiceOptions.createId`). */
export type ClientGatewayIdKind = "message" | "command" | "nonce" | "client";

/** A wait the gateway timed: `answer` is the wait for the answer to command `commandId`. */
export type ClientGatewayTimedWait = { readonly kind: "answer"; readonly commandId: string };

/** A running wait; cancelled once what it waited for came. */
export type ClientGatewayTimer = { cancel(): void };

/** Starts `wait`, calling `fire` once `delayMs` ran out without it being cancelled. */
export type ClientGatewayTimerSource = (wait: ClientGatewayTimedWait, delayMs: number, fire: () => void) => ClientGatewayTimer;

/**
 * A session as the gateway holds it: the public session plus the transport
 * socket, its queued outbound messages, and any pairing awaiting approval.
 * Never leaves the service — `ClientGatewaySessionRegistry.toPublic` strips it.
 */
export type InternalSession = ClientGatewaySession & {
  socket?: ClientGatewaySocket;
  outbound: ClientGatewayServerMessage[];
  pendingPairingCode?: string;
  /** The channel scope this session was attached under (`./channel-scope/`); absent for a live session. */
  channelScope?: string;
  /** The digest of the credential this session was last sent, so it can confirm that one and no other. */
  sentCredentialHash?: string;
  /** Where the transport says the connection came from; never public, audited as its prefix only. */
  peer?: import("./security/index.ts").ClientGatewayPeer;
  /**
   * The project the session was bound to when it became ready (its pairing's,
   * or none on a reconnect), which a `client.focus_project` of null returns it
   * to (`./project-focus/`). Never public.
   */
  pairedProjectId?: string | null;
  /** How many `client.focus_project` requests this session has sent, so only the latest one decided is applied. Never public. */
  focusRequests?: number;
};

/**
 * Whether the person who paired `session` may read `projectId` in `domainId`,
 * the domain the session declared: what a `client.focus_project` is decided by
 * (`./project-focus/`). Supplied by the layer that owns identity and IAM; a
 * thrown error reads as "could not decide".
 */
export type ClientGatewayProjectFocusAuthority = (request: { session: ClientGatewaySession; projectId: string; domainId: string | null }) => Promise<boolean>;

/** Where a host installs the focus authority (`ClientGatewayService.projectFocus`); undefined refuses every focus to a project as unavailable. */
export type ClientGatewayProjectFocusPort = { setAuthority(authority: ClientGatewayProjectFocusAuthority | undefined): void };

/**
 * Whether the person who paired `session` may read the chats of `projectId`
 * in `domainId`, the domain the session declared, as reading one of them
 * (`get-conversation`) would decide it for that person on the paired-client
 * channel: what a `server.conversation_changed` waits on
 * (`./project-focus/conversation-delivery.ts`). Supplied by the layer that owns
 * identity and IAM; a thrown error reads as "could not decide".
 */
export type ClientGatewayConversationReadAuthority = (request: { session: ClientGatewaySession; projectId: string; domainId: string | null }) => Promise<boolean>;

/**
 * Telling paired clients which chats changed (`ClientGatewayService.conversationPush`,
 * `./project-focus/conversation-delivery.ts`).
 */
export type ClientGatewayConversationPushPort = {
  /**
   * Installs the conversation read authority; undefined sends no
   * `server.conversation_changed` at all. Installing one, even the one
   * installed already, says what decisions were made from changed, which voids
   * every one the gateway reused.
   */
  setAuthority(authority: ClientGatewayConversationReadAuthority | undefined): void;
  /**
   * Tells each ready person-paired session whose person may read the chat
   * that it changed (its id and project, no content), as the installed
   * authority decides; a panel thread's change (null project) is sent to no
   * one. Returns how many sessions it was sent to, or queued for behind that
   * decision.
   */
  publish(change: ClientGatewayConversationChanged): number;
};

/** An action command dispatched to a client and still awaiting its result. */
export type PendingCommand = {
  sessionId: string;
  resolve(result: ClientGatewayActionResult): void;
  timeout: ClientGatewayTimer;
};

export type ClientGatewayItemKind = "sessions" | "pairings" | "trustedClients";
export type ClientGatewaySummaryItem = ClientGatewaySession | ClientGatewayPairingChallenge | ClientGatewayTrustedClientView;
export type ClientGatewaySummaryPage = { items: ClientGatewaySummaryItem[]; total: number; limit: number; lastId: string | null; hasMore: boolean };
