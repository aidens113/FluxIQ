// What every rekey pass works with (t745 design note D4, D5): the project
// database, the store's sealing with its protection and keyring (a rekey runs
// only in a protected store), the content store's object operations, the batch
// budget, and whether the project holds any key besides the current one (rows
// under a retired key are in an old form too; without one, only the unkeyed
// rows are, and the partial indexes over them keep every pass cheap).
import type { AutomationStudioContentAddressKeyring } from "../content-address/index.ts";
import type { AutomationStudioProjectContentProtection } from "../content-protection.ts";
import type { AutomationStudioProjectContentStore } from "../content-store.ts";
import type { AutomationStudioProjectDatabase } from "../database.ts";
import type { GatewayTraceRekeyBudget } from "./budget.ts";

/** The content store operations a rekey uses. */
export type GatewayTraceRekeyContent = Pick<AutomationStudioProjectContentStore, "readBytesByObjectId" | "putBytes" | "drainPendingRemovals">;

/** A protected store's sealing (the trace store's `GatewayTraceChunkSealing` with both the protection and the keyring there). */
export type GatewayTraceRekeySealing = {
  readonly projectId: string;
  readonly protection: AutomationStudioProjectContentProtection;
  readonly keyring: AutomationStudioContentAddressKeyring;
};

export type GatewayTraceRekeyContext = {
  readonly database: AutomationStudioProjectDatabase;
  readonly sealing: GatewayTraceRekeySealing;
  readonly content: GatewayTraceRekeyContent;
  readonly budget: GatewayTraceRekeyBudget;
  /** Whether `content_address_keys` holds a key other than the current one. */
  readonly retiredKeys: boolean;
};

/** A row left in its old form, named by kind and place only: never content, never a plain digest. */
export type GatewayTraceRekeySkip = {
  readonly kind: "event" | "artifact" | "manifest" | "object";
  readonly where: string;
  readonly reason: string;
};
