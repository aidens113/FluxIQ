import { NextResponse } from "next/server";
import { automationStudioPersonProject } from "fluxiq/automation-studio";
import { appRouteIamContract } from "../../../../lib/app-route-iam";
import { workspaceRouteContext } from "../../../../lib/workspaces/routes";

const ROUTE = appRouteIamContract("POST", "/api/client-gateway/first-project");

// A browser's chat has nowhere to be without a project, and nothing it could ask the person to do
// about that from there. So a browser whose person has none asks here. A person with a project of
// their own is told that one, never given a second, and the registry's own check decides the making.
// The paired client's token selects its own workspace, so the project is made there and nowhere else.
export async function POST(request: Request) {
  const selected = await workspaceRouteContext(request, ROUTE);
  if (!selected.ok) return NextResponse.json({ ok: false, error: selected.error }, { status: selected.status });
  const owner = selected.context;
  try {
    const domainId = owner.binding.channel === "paired-client" ? owner.binding.domainId : null;
    const projectId = await automationStudioPersonProject({ registry: owner.fluxiq.programs.api, actor: owner.caller.actor, domainId, create: true });
    return NextResponse.json({ ok: true, payload: { projectId } });
  } finally {
    owner.release();
  }
}
