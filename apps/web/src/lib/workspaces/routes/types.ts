import type { FluxIQ } from "fluxiq";
import type { AppRouteActor, AppRouteResourceInput } from "../../app-route-iam";

type PanelBinding = { readonly channel: "panel"; readonly workspaceId: string; readonly userId: string; readonly sessionId: string };
type PairedBinding = {
  readonly channel: "paired-client";
  readonly workspaceId: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly trustedClientId: string;
  readonly clientId: string;
  readonly clientType: string;
  readonly domainId: string | null;
  readonly projectId: string | null;
  readonly recordingId: string | null;
};

/** Server-owned identity and target, never a request-body context. */
export type WorkspaceRouteBinding = PanelBinding | PairedBinding;
export type WorkspaceRouteCaller = {
  readonly channel: "panel" | "paired-client";
  readonly actor: Readonly<AppRouteActor>;
  readonly binding: WorkspaceRouteBinding;
};
/** Identity is proved and the instance held; target IAM is not yet decided. Resolve data only, never execute an action here. */
export type WorkspaceRouteResourceResolver = (selection: Readonly<{
  workspaceId: string;
  fluxiq: FluxIQ;
  caller: WorkspaceRouteCaller;
}>) => AppRouteResourceInput | Promise<AppRouteResourceInput>;
export type WorkspaceRouteRefusal = { readonly ok: false; readonly status: 401 | 403 | 503; readonly error: string };
export type WorkspaceRouteValidation = { readonly ok: true; readonly caller: WorkspaceRouteCaller } | WorkspaceRouteRefusal;

/** Held request authority. Lazy bodies require the explicit stream owner; returning a body does not release this lease. */
export type WorkspaceRouteContext = {
  readonly workspaceId: string;
  readonly fluxiq: FluxIQ;
  readonly binding: WorkspaceRouteBinding;
  /** Initial snapshot; use a fresh successful revalidate result after an await. */
  readonly caller: WorkspaceRouteCaller;
  /** Synchronous runtime generation, abort and lease check; not a substitute for IAM revalidation. */
  current(): boolean;
  revalidate(): Promise<WorkspaceRouteValidation>;
  release(): void;
};
export type WorkspaceRouteSelection = { readonly ok: true; readonly context: WorkspaceRouteContext } | WorkspaceRouteRefusal;
