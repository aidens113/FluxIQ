import type { JsonObject } from "../../../../core/index.ts";
import type { RecordEnvelope, Repository, RepositoryScope } from "../../contracts/index.ts";
import type { ExecutionCallbackObservation } from "../../../../runtime/execution-observation/contracts/index.ts";

/** Separate internal execution capability; the public Repository tuples stay unchanged. */
export interface RepositoryExecutionPorts<T extends JsonObject> {
  readonly original: Repository<T>;
  list(scope: RepositoryScope | undefined, observation: ExecutionCallbackObservation): Promise<RecordEnvelope<T>[]>;
  put(record: RecordEnvelope<T>, observation: ExecutionCallbackObservation): Promise<RecordEnvelope<T>>;
}
