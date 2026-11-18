import { NextResponse } from "next/server";
import { appRouteIamContract } from "../../../../lib/app-route-iam";
import { getWorkspaceWebPresentation } from "../../../../lib/fluxiq";
import { workspaceRouteContext } from "../../../../lib/workspaces/routes";
import { WorkspacePresentationError } from "../../../../lib/workspaces/presentation";
import { ContextRouteError } from "./failure";
import { prepareContextWrite } from "./prepare";
import { validateContextSelection } from "./validate";

const ROUTE = appRouteIamContract("POST", "/api/client-gateway/automation-studio-context");

export async function POST(request: Request) {
  let prepared: Awaited<ReturnType<typeof prepareContextWrite>> | undefined;
  let inputFailure: ContextRouteError | undefined;
  const selected = await workspaceRouteContext(request, ROUTE, async selection => {
    try {
      prepared = await prepareContextWrite(request, selection);
      return { activeProjectId: prepared.selection.activeProjectId, activeFlowId: prepared.selection.activeFlowId };
    } catch (error) {
      if (error instanceof ContextRouteError) inputFailure = error;
      throw error;
    }
  });
  if (!selected.ok) return inputFailure ? refused(inputFailure) : refused(selected);
  const owner = selected.context;
  try {
    if (!prepared) throw new ContextRouteError(503, "Selected workspace context is unavailable.");
    const current = await validateContextSelection(owner, request.url, prepared.selection);
    if (!owner.current()) return refused({ status: 401, error: "Authentication required" });
    prepared.write.commit(prepared.selection);
    const presentation = getWorkspaceWebPresentation(owner.workspaceId, owner.fluxiq, { userId: current.binding.userId, channel: current.channel, ...(prepared.selection.clientId ? { clientId: prepared.selection.clientId } : {}) });
    const response = NextResponse.json({ ok: true, payload: presentation.present() }, { headers: { "cache-control": "private, no-store" } });
    await validateContextSelection(owner, request.url, prepared.selection);
    presentation.context();
    if (!owner.current()) return refused({ status: 401, error: "Authentication required" });
    return response;
  } catch (error) {
    if (error instanceof ContextRouteError) return refused(error);
    if (error instanceof WorkspacePresentationError) return refused({ status: error.code === "context_write_stale" ? 409 : 503, error: error.code === "context_write_stale" ? "A newer context selection has already been requested." : "Selected workspace context is unavailable." });
    return refused({ status: 500, error: "Automation Studio context could not be updated." });
  } finally {
    owner.release();
  }
}

function refused(refusal: { status: number; error?: string; message?: string }) {
  return NextResponse.json({ ok: false, error: refusal.error ?? refusal.message }, { status: refusal.status, headers: { "cache-control": "private, no-store" } });
}
