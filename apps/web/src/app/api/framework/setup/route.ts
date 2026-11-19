import { NextResponse } from "next/server";
import { reloadFluxIQWebInstance } from "../../../../lib/fluxiq";
import { operationalRouteContract } from "../../../../lib/operational-route-contract";
import { platformScope } from "../../../../lib/platform";
import { workspaceRouteContext } from "../../../../lib/workspaces/routes";

/**
 * Framework setup acts on the one data root of a single-workspace server, so
 * it is the operator's: the request guard refuses it on every public profile,
 * and under multi-tenancy the root also holds every tenant's workspace, so the
 * route refuses in code too, before reading the body.
 */
function operatorOnly(): NextResponse | null {
  if (platformScope().tenancy !== "multi") return null;
  return NextResponse.json({ ok: false, code: "operator_only", error: "Framework setup is run by the operator, not through this server." }, { status: 403, headers: { "cache-control": "no-store" } });
}

function refused(refusal: { status: number; error: string }): NextResponse {
  return NextResponse.json({ ok: false, error: refusal.error }, { status: refusal.status });
}

export async function GET(request: Request) {
  const blocked = operatorOnly();
  if (blocked) return blocked;
  const contract = operationalRouteContract("GET", "/api/framework/setup");
  const selected = await workspaceRouteContext(request, contract.iam);
  if (!selected.ok) return refused(selected);
  const owner = selected.context;
  try {
    return NextResponse.json({
      ok: true,
      paths: owner.fluxiq.paths,
      storage: owner.fluxiq.inspectStorage(),
      domains: owner.fluxiq.domains.summaries()
    });
  } finally {
    owner.release();
  }
}

export async function POST(request: Request) {
  const blocked = operatorOnly();
  if (blocked) return blocked;
  const body = await request.clone().json().catch(() => ({})) as { action?: unknown };
  const action = typeof body.action === "string" ? body.action : "setup";
  let contract;
  try { contract = operationalRouteContract("POST", "/api/framework/setup", action); }
  catch { return NextResponse.json({ ok: false, error: "Unsupported framework setup action" }, { status: 400 }); }
  const selected = await workspaceRouteContext(request, contract.iam);
  if (!selected.ok) return refused(selected);
  const owner = selected.context;
  const reloads = body.action === "migrate" || body.action === "rollback-migration";
  let result;
  try {
    result = body.action === "migrate"
      ? await owner.fluxiq.migrateStorage()
      : body.action === "rollback-migration"
        ? await owner.fluxiq.rollbackStorageMigration()
        : await owner.fluxiq.setup();
  } finally {
    // A reload closes the primary, so the lease is released first.
    owner.release();
  }
  if (reloads) await reloadFluxIQWebInstance();
  return NextResponse.json({ ok: true, ...result });
}
