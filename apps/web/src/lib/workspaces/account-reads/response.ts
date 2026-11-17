import type { AppRouteIamContract } from "../../app-route-iam";
import { workspaceRouteContext, type WorkspaceRouteRefusal } from "../routes";
import { AccountReadError } from "./error";
import { WorkspaceAccountReadOwner } from "./owner";
import type { AccountReadWork } from "./types";

/** A JSON-data-only boundary that owns status, serialization, final authority and both leases. */
export async function withWorkspaceAccountRead(request: Request, contract: AppRouteIamContract, read: AccountReadWork): Promise<Response> {
  const selected = await workspaceRouteContext(request, contract);
  if (!selected.ok) return refusalResponse(selected);
  let owner: WorkspaceAccountReadOwner | undefined;
  let completed = false;
  let response = refusalResponse(new AccountReadError().refusal);
  try {
    const runtime = await import("../../fluxiq");
    owner = new WorkspaceAccountReadOwner(selected.context, runtime, request.signal);
    await owner.initialize();
    const answer = await read(owner.context);
    owner.assertCurrent();
    if ((answer.status !== 200 && answer.status !== 400) || answer.body instanceof Response || answer.body instanceof ReadableStream) throw new AccountReadError();
    response = Response.json(answer.body, { status: answer.status, headers: { "cache-control": "no-store" } });
    await owner.settleReads();
    await owner.guard();
    owner.assertCurrent();
    owner.releaseSettled();
    completed = true;
  } catch (error) {
    response = refusalResponse(error instanceof AccountReadError ? error.refusal : new AccountReadError().refusal);
  } finally {
    if (!completed) {
      try {
        if (owner) await owner.release();
        else selected.context.release();
      } catch {
        if (!owner) console.error("account_read.cleanup_failed");
        if (response.status < 400) response = refusalResponse(new AccountReadError().refusal);
      }
    }
  }
  return response;
}

function refusalResponse(refusal: WorkspaceRouteRefusal): Response {
  const code = refusal.status === 401 ? "unauthenticated" : refusal.status === 403 ? "forbidden" : "temporarily_unavailable";
  return Response.json({ ok: false, code, error: refusal.status === 401 ? "Sign in again." : refusal.error }, { status: refusal.status, headers: { "cache-control": "no-store" } });
}
