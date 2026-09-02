import { NextResponse } from "next/server";
import { requireFluxIQUser } from "../../../../lib/auth";
import { getFluxIQ, reloadFluxIQWebInstance } from "../../../../lib/fluxiq";
import { canUseOperationalRoute, operationalRouteContract } from "../../../../lib/operational-route-contract";

export async function GET() {
  const auth = await requireFluxIQUser();
  if (!auth) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const contract = operationalRouteContract("GET", "/api/framework/setup");
  if (!canUseOperationalRoute(auth.role.permissions, contract)) return NextResponse.json({ ok: false, error: `Permission required: ${contract.permission}` }, { status: 403 });
  const fluxiq = getFluxIQ();
  return NextResponse.json({
    ok: true,
    paths: fluxiq.paths,
    storage: fluxiq.inspectStorage(),
    domains: fluxiq.domains.summaries()
  });
}

export async function POST(request: Request) {
  const auth = await requireFluxIQUser();
  if (!auth) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { action?: unknown };
  const action = typeof body.action === "string" ? body.action : "setup";
  let contract;
  try { contract = operationalRouteContract("POST", "/api/framework/setup", action); }
  catch { return NextResponse.json({ ok: false, error: "Unsupported framework setup action" }, { status: 400 }); }
  if (!canUseOperationalRoute(auth.role.permissions, contract)) return NextResponse.json({ ok: false, error: `Permission required: ${contract.permission}` }, { status: 403 });
  const fluxiq = getFluxIQ();
  const result = body.action === "migrate"
    ? await fluxiq.migrateStorage()
    : body.action === "rollback-migration"
      ? await fluxiq.rollbackStorageMigration()
      : await fluxiq.setup();
  if (body.action === "migrate" || body.action === "rollback-migration") await reloadFluxIQWebInstance();
  return NextResponse.json({
    ok: true,
    ...result
  });
}
