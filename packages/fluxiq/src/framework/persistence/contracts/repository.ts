import type { JsonObject } from "../../../core/index.ts";
import type { RepositoryScope } from "./scope.ts";
import type { RecordEnvelope } from "./record-envelope.ts";
import type { RepositoryListPageOptions } from "./list-page-options.ts";
import type { RepositoryListPage } from "./list-page.ts";

export type Repository<T extends JsonObject = JsonObject> = {
  list(scope?: RepositoryScope): Promise<Array<RecordEnvelope<T>>>;
  listPage?(scope?: RepositoryScope, options?: RepositoryListPageOptions): Promise<RepositoryListPage<T>>;
  get(id: string, scope?: RepositoryScope): Promise<RecordEnvelope<T> | null>;
  put(record: RecordEnvelope<T>): Promise<RecordEnvelope<T>>;
  delete(id: string, scope?: RepositoryScope): Promise<boolean>;
};
