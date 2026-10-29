import { randomUUID } from "node:crypto";
import { PLATFORM_PROVISIONING_OPERATIONS } from "@fluxiq/contracts/platform";
import type { PlatformProvisioningInput, PlatformProvisioningOperationName, PlatformProvisioningResponse, PlatformProvisioningResult } from "@fluxiq/contracts/platform";
import { authorizeProvisioningOperation } from "../authorization/index.ts";
import { lastAdministratorRefusal, ProvisioningRefusal, twoFactorRefusal } from "../context/index.ts";
import type { ProvisioningContext } from "../context/index.ts";
import { runIdempotent } from "../idempotency/index.ts";
import { PROVISIONING_OPERATION_TABLE } from "../operations/index.ts";
import type { ProvisioningInvocation, ProvisioningOperation } from "../operations/index.ts";
import type { PlatformProvisioningAnswer, PlatformProvisioningCaller } from "../types.ts";
import { parseProvisioningInput } from "./parse-provisioning-input.ts";

function requestIdOf(input: object): string | null {
  const requestId: unknown = (input as { requestId?: unknown }).requestId;
  return typeof requestId === "string" ? requestId : null;
}

async function settle<TName extends PlatformProvisioningOperationName>(
  operation: ProvisioningOperation<TName>,
  context: ProvisioningContext,
  input: PlatformProvisioningInput<TName>,
  invocation: ProvisioningInvocation
): Promise<PlatformProvisioningResponse<PlatformProvisioningResult<TName>>> {
  try {
    return { ok: true, result: await operation.execute(context, input, invocation) };
  } catch (error) {
    if (error instanceof ProvisioningRefusal) return { ok: false, error: error.toError() };
    const refusal = lastAdministratorRefusal(error) ?? twoFactorRefusal(error);
    if (refusal !== null) return { ok: false, error: refusal.toError() };
    throw error;
  }
}

/**
 * Runs one operation: an unknown one, or an in-process-only one over HTTP,
 * is `operation_unavailable`; the input is parsed for the transport
 * (`invalid_input`); the call is authorised as one recorded IAM decision on
 * the account (`forbidden` on a deny); then a mutation runs through the
 * process's queue and is idempotent by `requestId`, while `getAccount`, a
 * read, runs directly. A typed refusal is answered, never thrown, and so is
 * identity access refusing the last enabled administrator
 * (`last_administrator`) or a sealed two-factor account's reset (`two_factor`); any other failure propagates as an error, which the
 * listener answers as a generic `internal_error` (it is not answered here, so
 * a transient failure is never stored as a `requestId`'s answer).
 */
export async function runProvisioningOperation<TName extends PlatformProvisioningOperationName>(
  context: ProvisioningContext,
  operation: TName,
  value: unknown,
  caller: PlatformProvisioningCaller
): Promise<PlatformProvisioningAnswer<TName>> {
  if (typeof operation !== "string" || !Object.hasOwn(PLATFORM_PROVISIONING_OPERATIONS, operation)) {
    return { ok: false, error: { code: "operation_unavailable", message: "No such provisioning operation." } };
  }
  const spec = PLATFORM_PROVISIONING_OPERATIONS[operation];
  if (caller.transport === "http" && !spec.http) return { ok: false, error: { code: "operation_unavailable", message: `${operation} is not available over HTTP.` } };
  const parsed = parseProvisioningInput(operation, value, caller.transport);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const input = parsed.input;
  const handler: ProvisioningOperation<TName> = PROVISIONING_OPERATION_TABLE[operation];
  const requestId = requestIdOf(input);
  const accountId = await handler.target(context, input);
  const authorization = await authorizeProvisioningOperation(context, caller, spec.action, accountId, requestId ?? randomUUID());
  if (!authorization.allowed) return { ok: false, error: { code: "forbidden", message: `The caller is not allowed ${spec.action} on this account.` } };
  const invocation: ProvisioningInvocation = { caller, grant: authorization.grant, accountId };
  if (requestId === null) return settle(handler, context, input, invocation);
  return context.queue.run(() => runIdempotent(context.store, operation, requestId, input, context.now(), () => settle(handler, context, input, invocation)));
}
