import { NextResponse } from "next/server";
import { requireFluxIQUser } from "../../../../../lib/auth";
import { getFluxIQ } from "../../../../../lib/fluxiq";
import { authorizeAppRoute, panelRouteActor } from "../../../../../lib/app-route-iam";
import { operationalRouteContract } from "../../../../../lib/operational-route-contract";

export async function POST(request: Request) {
  const auth = await requireFluxIQUser();
  if (!auth) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const contract = operationalRouteContract("POST", "/api/framework/io/validate");
  const fluxiq = getFluxIQ();
  const refusal = await authorizeAppRoute(fluxiq.programs.api, contract.iam, "panel", panelRouteActor(auth));
  if (refusal) return NextResponse.json({ ok: false, error: refusal.error }, { status: refusal.status });
  const payload = await request.json().catch(() => ({})) as {
    domain_id?: string;
    domainId?: string;
    required_inputs?: string[];
    requiredInputs?: string[];
    required_outputs?: string[];
    requiredOutputs?: string[];
    source?: string;
  };
  const domainId = payload.domainId ?? payload.domain_id ?? null;
  const requiredInputs = payload.requiredInputs ?? payload.required_inputs;
  const requiredOutputs = payload.requiredOutputs ?? payload.required_outputs;
  const issues = domainId && !requiredInputs && !requiredOutputs
    ? fluxiq.validateDomainIo(domainId)
    : fluxiq.validateIoRequirements(validationParams(domainId, requiredInputs, requiredOutputs, payload.source));

  return NextResponse.json({
    ok: issues.every((issue) => issue.severity !== "error"),
    issues
  });
}

function validationParams(
  domainId: string | null,
  requiredInputs: string[] | undefined,
  requiredOutputs: string[] | undefined,
  source: string | undefined
): Parameters<ReturnType<typeof getFluxIQ>["validateIoRequirements"]>[0] {
  const params: Parameters<ReturnType<typeof getFluxIQ>["validateIoRequirements"]>[0] = {};
  if (domainId !== null) {
    params.domainId = domainId;
  }
  if (requiredInputs) {
    params.requiredInputs = requiredInputs;
  }
  if (requiredOutputs) {
    params.requiredOutputs = requiredOutputs;
  }
  if (source) {
    params.source = source;
  }
  return params;
}
