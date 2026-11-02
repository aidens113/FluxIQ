import type { JsonObject } from "../../../core/index.ts";
import type { RepositoryListPage } from "../contracts/index.ts";

export type SQLiteListPage<T extends JsonObject = JsonObject> = RepositoryListPage<T>;
