import { NextResponse } from "next/server";
import { automationStudioPersonProject } from "fluxiq/automation-studio";
import { programDomainScope } from "fluxiq/server";
import { appRouteIamContract } from "../../../../lib/app-route-iam";
import { workspaceRouteContext } from "../../../../lib/workspaces/routes";

const ROUTE = appRouteIamContract("POST", "/api/client-gateway/first-project");

// Every chat belongs to a project, and a person need not make one first. So a chat whose person has
// none open asks here: a browser's chat (which has nothing else it could ask the person to do) and
// the panel's own chat alike. A person with a project of their own is told that one, never given a
// second, and the registry's own check decides the making.
// The paired client's token selects its own workspace and domain, so the project is made there and
// nowhere else; a browser paired without a domain is given none. The panel asks in the domain its page
// is scoped to, or in none, as its own project list reads them.
export async function POST(request: Request) {
  const selected = await workspaceRouteContext(request, ROUTE);
  if (!selected.ok) return NextResponse.json({ ok: false, error: selected.error }, { status: selected.status });
  const owner = selected.context;
  try {
    const paired = owner.binding.channel === "paired-client";
    const domainId = owner.binding.channel === "paired-client" ? owner.binding.domainId : programDomainScope(request.url).domainId;
    const projectId = await automationStudioPersonProject({ registry: owner.fluxiq.programs.api, actor: owner.caller.actor, domainId, create: true, ...(paired ? {} : { unscoped: true }) });
    return NextResponse.json({ ok: true, payload: { projectId } });
  } finally {
    owner.release();
  }
}
