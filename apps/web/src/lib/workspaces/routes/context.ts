import { readBearerToken } from "fluxiq/server";
import { FLUXIQ_SESSION_COOKIE } from "../../session-cookie";
import type { AppRouteCaller, AppRouteIamContract, AppRouteResourceInput } from "../../app-route-iam";
// The parent barrel re-exports this adapter; direct imports avoid a load-time cycle.
import { sessionIdOf } from "../session-id-of";
import { workspaceProgramContext } from "../program-context";
import { authorizeWorkspaceRoute } from "./authorize";
import { sameWorkspaceRouteAuthority } from "./authority";
import { sameWorkspaceRouteBinding } from "./binding";
import { readWorkspaceRouteCaller } from "./caller";
import { snapshotRouteResources } from "./resources";
import type { WorkspaceRouteResourceResolver, WorkspaceRouteSelection, WorkspaceRouteValidation } from "./types";

/** One route's trusted identity, tenant lease and frozen IAM resources. No request-body context is accepted. */
export async function workspaceRouteContext(request: Request, contract: AppRouteIamContract, input: AppRouteResourceInput | WorkspaceRouteResourceResolver = {}): Promise<WorkspaceRouteSelection> {
  if (request.signal.aborted) return authenticationRequired();
  const sessionId = sessionIdOf(request, FLUXIQ_SESSION_COOKIE);
  const token = readBearerToken(request.headers.get("authorization"));
  const channel: AppRouteCaller = sessionId ? "panel" : "paired-client";
  if (!sessionId && !token) return authenticationRequired();
  if (contract.callers[channel] === undefined) return { ok: false, status: 403, error: `This endpoint is not available to a ${channel === "panel" ? "panel caller" : "paired client"}.` };
  const initialResources = typeof input === "function" ? null : snapshotRouteResources(input);
  if (initialResources && !initialResources.ok) return { ok: false, status: 403, error: initialResources.error };
  let selected: Awaited<ReturnType<typeof workspaceProgramContext>> = null;
  let released = false;
  let retained = false;
  const release = () => {
    if (released) return;
    released = true;
    selected?.release();
  };
  try {
    selected = await workspaceProgramContext(request);
    if (!selected) return authenticationRequired();
    if (channel === "paired-client" && (selected.sessionId || readBearerToken(selected.authorization) !== token)) return authenticationRequired();
    const owner = selected;
    const current = () => !released && !request.signal.aborted && owner.current();
    const guard = async () => {
      if (released || request.signal.aborted) return false;
      const current = !owner.context.revalidateAuthority || await owner.context.revalidateAuthority();
      return current && !released && !request.signal.aborted && owner.current();
    };
    if (!await guard()) return authenticationRequired();
    const first = await readWorkspaceRouteCaller({ selected: owner, channel, sessionId, token, url: request.url });
    if (!first.ok) return first;
    const binding = first.caller.binding;
    // Body-derived targets are resolved under this exact identity/lease,
    // without imposing an unrelated preliminary self/workspace IAM grant.
    if (!await guard()) return authenticationRequired();
    const resources = initialResources ?? snapshotRouteResources(await (input as WorkspaceRouteResourceResolver)(Object.freeze({ workspaceId: owner.workspaceId, fluxiq: owner.context.fluxiq, caller: first.caller })));
    if (!resources.ok) return { ok: false, status: 403, error: resources.error };
    const revalidate = async (): Promise<WorkspaceRouteValidation> => {
      try {
        if (!await guard()) return authenticationRequired();
        const current = await readWorkspaceRouteCaller({ selected: owner, channel, sessionId, token, url: request.url });
        if (!current.ok) return current;
        if (!sameWorkspaceRouteBinding(binding, current.caller.binding)) return authenticationRequired();
        const refusal = await authorizeWorkspaceRoute(owner.context.fluxiq, contract, current.caller, resources.value);
        if (refusal) return refusal;
        if (!await guard()) return authenticationRequired();
        const after = await readWorkspaceRouteCaller({ selected: owner, channel, sessionId, token, url: request.url });
        if (!after.ok) return after;
        if (!sameWorkspaceRouteAuthority(current.caller, after.caller)) return { ok: false, status: 403, error: "Request authority changed during authorization." };
        if (!await guard()) return authenticationRequired();
        return after;
      } catch {
        return authorityUnavailable();
      }
    };
    const admitted = await revalidate();
    if (!admitted.ok) return admitted;
    retained = true;
    return { ok: true, context: Object.freeze({ workspaceId: owner.workspaceId, fluxiq: owner.context.fluxiq, binding, caller: admitted.caller, current, revalidate, release }) };
  } catch {
    return authorityUnavailable();
  } finally {
    if (!retained) release();
  }
}

function authenticationRequired(): WorkspaceRouteValidation & { ok: false } {
  return { ok: false, status: 401, error: "Authentication required" };
}

function authorityUnavailable(): WorkspaceRouteValidation & { ok: false } {
  return { ok: false, status: 503, error: "Request authority could not be verified." };
}
