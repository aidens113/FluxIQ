import { SQLiteRepository } from "../../../framework/persistence/repository/sqlite-repository.ts";
import { planEnvironmentIntent } from "../model/index.ts";
import type {
  EnvironmentIntent,
  EnvironmentIntentResult,
  EnvironmentObservedState,
  EnvironmentRecord,
  EnvironmentStore
} from "../model/index.ts";
import { EnvironmentRows } from "./environment-rows.ts";

/**
 * Durable dedicated-environment state, following the commerce ledger's
 * pattern: each method runs in one BEGIN IMMEDIATE transaction, so the
 * operation-id ledger, the record and its indexes commit together across
 * connections and processes. Driver calls are the controller's, outside it.
 */
export class SQLiteEnvironmentStore implements EnvironmentStore {
  private readonly repository: SQLiteRepository;
  private readonly now: () => number;

  constructor(options: { rootDir: string; now?: () => number }) {
    this.repository = new SQLiteRepository({ rootDir: options.rootDir, kind: "platform.environments" });
    this.now = options.now ?? Date.now;
  }

  get(environmentId: string): Promise<EnvironmentRecord | null> {
    return this.transaction((rows) => rows.getRecord(environmentId));
  }

  listAll(): Promise<EnvironmentRecord[]> {
    return this.transaction((rows) => rows.listRecords());
  }

  listByAccount(accountId: string): Promise<EnvironmentRecord[]> {
    return this.transaction((rows) => rows.listIndexed("account", accountId));
  }

  listByWorkspace(workspaceId: string): Promise<EnvironmentRecord[]> {
    return this.transaction((rows) => rows.listIndexed("workspace", workspaceId));
  }

  recordIntent(intent: EnvironmentIntent): Promise<EnvironmentIntentResult> {
    const nowMs = this.clock();
    return this.transaction(async (rows) => {
      const existing = await rows.getRecord(intent.environmentId);
      const previous = await rows.getOperation(intent.environmentId, intent.operationId);
      const plan = planEnvironmentIntent(existing, previous, intent);
      if (plan.replayed) return { record: plan.record, replayed: true };
      await rows.putRecord(plan.record, nowMs);
      await rows.putOperation(plan.operation, nowMs);
      return { record: plan.record, replayed: false };
    });
  }

  observe(environmentId: string, operationId: string, observed: EnvironmentObservedState): Promise<EnvironmentRecord | null> {
    const nowMs = this.clock();
    return this.transaction(async (rows) => {
      const current = await rows.getRecord(environmentId);
      if (current === null || current.operationId !== operationId) return current;
      const next: EnvironmentRecord = { ...current, observed };
      await rows.putRecord(next, nowMs);
      return next;
    });
  }

  purge(environmentId: string): Promise<boolean> {
    return this.transaction((rows) => rows.purge(environmentId));
  }

  private clock(): number {
    const nowMs = this.now();
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new TypeError("Invalid environment clock");
    return nowMs;
  }

  private transaction<T>(operation: (rows: EnvironmentRows) => Promise<T>): Promise<T> {
    return this.repository.transaction({}, (transaction) => operation(new EnvironmentRows(transaction, this.repository.tableName)));
  }
}
