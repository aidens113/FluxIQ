import type { WorkspaceRouteCaller, WorkspaceRouteContext, WorkspaceRouteRefusal } from "../types";

export type WorkspaceStreamRefusal = Omit<WorkspaceRouteRefusal, "status"> & { readonly status: 400 | 401 | 403 | 404 | 500 | 503 };

export type WorkspaceStreamDescriptor = {
  readonly ok: true;
  readonly iterator: AsyncIterator<string | Uint8Array, unknown>;
  readonly headers: HeadersInit;
  readonly status?: number;
  /** Fresh project/domain authority, evaluated around reads in addition to the selected context's IAM. */
  readonly revalidateDomain: () => Promise<WorkspaceStreamRefusal | null>;
};

export type WorkspaceStreamPreparation = WorkspaceStreamDescriptor | WorkspaceStreamRefusal;
export type WorkspaceStreamPrepare = (context: WorkspaceRouteContext, caller: WorkspaceRouteCaller) => WorkspaceStreamPreparation | Promise<WorkspaceStreamPreparation>;
export type WorkspaceStreamOptions = { readonly onCleanupFailure?: (code: "workspace_stream.cleanup_failed") => void };
