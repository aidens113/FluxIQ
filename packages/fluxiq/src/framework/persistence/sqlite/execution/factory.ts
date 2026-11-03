import type { JsonObject } from "../../../../core/index.ts";
import { SQLiteRepository } from "../repository.ts";
import type { RepositoryExecutionPorts } from "./ports.ts";

const create = SQLiteRepository.executionPorts;

/** Only the actual unpooled Core repository can mint this separate native capability. */
export function createSQLiteRepositoryExecutionPorts<T extends JsonObject>(original: SQLiteRepository<T>): RepositoryExecutionPorts<T> {
  return create<T>(original);
}
