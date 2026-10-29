import type { FluxIQRequestOrigin } from "@fluxiq/contracts/iam";
import type { IamMatchedStatement } from "../../types.ts";

/**
 * Who is making a change, passed by the caller on every mutation and copied
 * into its `iam-change` audit record. The store does not authorize: the caller
 * already did, and may pass the deciding statement as `matched`. Without it
 * the record cites `{ policy: "store", sid: null }`.
 */
export type IamChangeContext = {
  actor: string;
  origin: FluxIQRequestOrigin;
  requestId: string;
  ipPrefix?: string | null;
  matched?: IamMatchedStatement;
};
