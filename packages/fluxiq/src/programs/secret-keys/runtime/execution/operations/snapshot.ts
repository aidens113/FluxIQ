import type { SecretKeysSnapshot } from "../../../types.ts";
import type { SecretKeysOperationContext } from "../owner/index.ts";
import type { SecretKeysExecutionInvocation } from "../invocation.ts";
import { secretKeySummary } from "../metadata/index.ts";

export async function snapshotSecretKeys(context: SecretKeysOperationContext, invocation?: SecretKeysExecutionInvocation): Promise<SecretKeysSnapshot> {
  await context.store.load(invocation);
  return { keys: context.store.list().map(secretKeySummary).sort((left, right) => right.updatedAtMs - left.updatedAtMs || left.name.localeCompare(right.name)) };
}
