import type { IamStoreScope } from "../context/index.ts";
import type { IamStoredInlinePolicy } from "../records/index.ts";

/** Drops a deleted principal's attachments, boundary and inline policies. */
export async function removePrincipalState(scope: IamStoreScope, frn: string): Promise<void> {
  await scope.records.remove("attachments", frn);
  await scope.records.remove("boundary", frn);
  for (const inline of await scope.records.list<IamStoredInlinePolicy>("inline")) {
    if (inline.principalFrn === frn) await scope.records.remove("inline", `${frn}/${inline.name}`);
  }
}
