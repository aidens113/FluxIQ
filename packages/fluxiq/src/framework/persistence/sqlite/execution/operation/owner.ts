import type { JsonObject } from "../../../../../core/index.ts";
import type { RecordEnvelope, Repository, RepositoryScope } from "../../../contracts/index.ts";
import type { ExecutionCallbackObservation } from "../../../../../runtime/execution-observation/contracts/index.ts";
import { ExecutionCallbackPolicies } from "../../../../../runtime/execution-observation/policies/index.ts";
import { invokeSQLiteRepositoryOperation } from "./invoke.ts";
import type { SQLiteRepositoryOperations } from "./operations.ts";
import type { RepositoryExecutionPorts } from "../index.ts";

/** Original receiver-specific forwarding frames; completion belongs to their actual native children. */
export function createRepositoryExecutionPorts<T extends JsonObject>(original: Repository<T>, operations: SQLiteRepositoryOperations<T>): RepositoryExecutionPorts<T> {
  const assert = operations.assert;
  const list = operations.list;
  const put = operations.put;
  const ports: RepositoryExecutionPorts<T> = Object.freeze({
    original,
    async list(this: RepositoryExecutionPorts<T>, scope: RepositoryScope | undefined, observation: ExecutionCallbackObservation): Promise<RecordEnvelope<T>[]> {
      if (this !== ports) throw new Error("repository.execution.foreign_ports");
      if (!observation) throw new Error("repository.execution.observation_required");
      assert.call(operations);
      return await invokeSQLiteRepositoryOperation(observation, "list", () => assert.call(operations), native => list.call(operations, scope ?? {}, native));
    },
    async put(this: RepositoryExecutionPorts<T>, record: RecordEnvelope<T>, observation: ExecutionCallbackObservation): Promise<RecordEnvelope<T>> {
      if (this !== ports) throw new Error("repository.execution.foreign_ports");
      if (!observation) throw new Error("repository.execution.observation_required");
      assert.call(operations);
      return await invokeSQLiteRepositoryOperation(observation, "put", () => assert.call(operations), native => put.call(operations, record, native));
    }
  });
  ExecutionCallbackPolicies.remember(ports, ports.list, "frame");
  ExecutionCallbackPolicies.remember(ports, ports.put, "frame");
  return ports;
}
