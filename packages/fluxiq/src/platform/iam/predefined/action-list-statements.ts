import { IAM_STATEMENT_MAX_ENTRIES } from "@fluxiq/contracts/iam";

function pascal(service: string): string {
  return service.slice(0, 1).toUpperCase() + service.slice(1);
}

/**
 * Turns a list of action names into statements of one effect on `resources`:
 * one statement per service, split again so no `Action` element lists more
 * than `IAM_STATEMENT_MAX_ENTRIES` names. Sids are `<sidPrefix><Service>`, and
 * `<sidPrefix><Service><n>` from the second chunk of a service on, so an
 * audit record names the service that decided. Names are kept in the list's
 * order and deduplicated.
 */
export function iamActionListStatements(sidPrefix: string, effect: "Allow" | "Deny", actions: readonly string[], resources: readonly string[]): unknown[] {
  const byService = new Map<string, string[]>();
  for (const action of new Set(actions)) {
    const service = action.slice(0, action.indexOf(":"));
    const group = byService.get(service) ?? [];
    group.push(action);
    byService.set(service, group);
  }
  const statements: unknown[] = [];
  for (const [service, group] of byService) {
    for (let start = 0; start < group.length; start += IAM_STATEMENT_MAX_ENTRIES) {
      const chunk = start / IAM_STATEMENT_MAX_ENTRIES;
      const sid = `${sidPrefix}${pascal(service)}${chunk === 0 ? "" : String(chunk + 1)}`;
      statements.push({ Sid: sid, Effect: effect, Action: group.slice(start, start + IAM_STATEMENT_MAX_ENTRIES), Resource: [...resources] });
    }
  }
  return statements;
}
