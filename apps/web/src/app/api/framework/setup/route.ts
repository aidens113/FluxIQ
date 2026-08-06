import { NextResponse } from "next/server";
import { requireFluxIQUser } from "../../../../lib/auth";
import { getFluxIQ, reloadFluxIQWebInstance } from "../../../../lib/fluxiq";

export async function GET() {
  const auth = await requireFluxIQUser();
  if (!auth) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
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
  if (!auth.role.permissions.includes("programs.write")) return NextResponse.json({ ok: false, error: "Permission required: programs.write" }, { status: 403 });
  const fluxiq = getFluxIQ();
  const body = await request.json().catch(() => ({})) as { action?: unknown };
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
