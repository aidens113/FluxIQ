// The SQL filters that select a table's rows in an old form, one per phase:
// first the rows that name no key (served by the 0034 partial index on them),
// then, only when the project holds a retired key, the rows under a key that
// is not the current one, written `< ? or > ?` so the partial index on the
// non-null key ids serves them (`<> ?` would scan the table). The column is
// one of the rekey's own constants, never caller text.
import type { GatewayTraceRekeyContext } from "./context.ts";

export type GatewayTraceOldFormFilter = { readonly where: string; readonly params: readonly unknown[] };

export function gatewayTraceOldFormFilters(context: GatewayTraceRekeyContext, column: string): readonly GatewayTraceOldFormFilter[] {
  const unkeyed: GatewayTraceOldFormFilter = { where: `${column} is null`, params: [] };
  if (!context.retiredKeys) return [unkeyed];
  const current = context.sealing.keyring.currentKeyId;
  return [unkeyed, { where: `(${column} < ? or ${column} > ?)`, params: [current, current] }];
}
