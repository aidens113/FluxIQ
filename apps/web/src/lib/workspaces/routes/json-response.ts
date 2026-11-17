import { NextResponse } from "next/server";
import type { AppRouteIamContract, AppRouteResourceInput } from "../../app-route-iam";
import { workspaceRouteContext } from "./context";
import type { WorkspaceRouteCaller, WorkspaceRouteContext, WorkspaceRouteRefusal } from "./types";

/** Owns a fully buffered JSON response. Streams and arbitrary Response objects require a different owner. */
export async function withWorkspaceRouteJson(request: Request, contract: AppRouteIamContract, resources: AppRouteResourceInput, answer: (context: WorkspaceRouteContext, caller: WorkspaceRouteCaller) => unknown | Promise<unknown>): Promise<NextResponse> {
  const selected = await workspaceRouteContext(request, contract, resources);
  if (!selected.ok) return refusalResponse(selected);
  const context = selected.context;
  try {
    const before = await context.revalidate();
    if (!before.ok) return refusalResponse(before);
    const payload = await answer(context, before.caller);
    if (payload instanceof Response || payload instanceof ReadableStream) throw new TypeError("This adapter supports buffered JSON data only.");
    const response = NextResponse.json(payload);
    const after = await context.revalidate();
    if (!after.ok) return refusalResponse(after);
    return context.current() ? response : refusalResponse({ ok: false, status: 401, error: "Authentication required" });
  } catch {
    return NextResponse.json({ ok: false, error: "Request could not be completed." }, { status: 500 });
  } finally {
    context.release();
  }
}

function refusalResponse(refusal: WorkspaceRouteRefusal): NextResponse {
  return NextResponse.json({ ok: false, error: refusal.error }, { status: refusal.status });
}
