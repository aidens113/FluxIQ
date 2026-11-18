import { NextResponse } from "next/server";
import type { FluxIQ } from "fluxiq";
import { operationalRouteContract } from "../../../../../lib/operational-route-contract";
import { workspaceRouteContext, type WorkspaceRouteRefusal } from "../../../../../lib/workspaces";

const ROUTE = operationalRouteContract("POST", "/api/framework/io/validate").iam;
type ValidationPayload = { domain_id?: string; domainId?: string; required_inputs?: string[]; requiredInputs?: string[]; required_outputs?: string[]; requiredOutputs?: string[]; source?: string };

export async function POST(request: Request) {
  const selected = await workspaceRouteContext(request, ROUTE);
  if (!selected.ok) return refusalResponse(selected);
  const context = selected.context;
  try {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return invalidPayload();
    }
    if (!isValidationPayload(payload)) return invalidPayload();
    const current = await context.revalidate();
    if (!current.ok) return refusalResponse(current);
    const domainId = payload.domainId ?? payload.domain_id ?? null;
    const requiredInputs = payload.requiredInputs ?? payload.required_inputs;
    const requiredOutputs = payload.requiredOutputs ?? payload.required_outputs;
    const issues = domainId && !requiredInputs && !requiredOutputs
      ? context.fluxiq.validateDomainIo(domainId)
      : context.fluxiq.validateIoRequirements(validationParams(domainId, requiredInputs, requiredOutputs, payload.source));
    const response = NextResponse.json({ ok: issues.every((issue) => issue.severity !== "error"), issues });
    const final = await context.revalidate();
    return final.ok ? response : refusalResponse(final);
  } catch {
    return NextResponse.json({ ok: false, error: "Request could not be completed." }, { status: 500 });
  } finally {
    context.release();
  }
}

function refusalResponse(refusal: WorkspaceRouteRefusal) {
  return NextResponse.json({ ok: false, error: refusal.error }, { status: refusal.status });
}

function invalidPayload() {
  return NextResponse.json({ ok: false, error: "Invalid validation request." }, { status: 400 });
}

function isValidationPayload(value: unknown): value is ValidationPayload {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  for (const field of ["domainId", "domain_id", "source"]) {
    if (input[field] !== undefined && typeof input[field] !== "string") return false;
  }
  for (const field of ["requiredInputs", "required_inputs", "requiredOutputs", "required_outputs"]) {
    const item = input[field];
    if (item !== undefined && (!Array.isArray(item) || !item.every(element => typeof element === "string"))) return false;
  }
  return true;
}

function validationParams(
  domainId: string | null,
  requiredInputs: string[] | undefined,
  requiredOutputs: string[] | undefined,
  source: string | undefined
): Parameters<FluxIQ["validateIoRequirements"]>[0] {
  const params: Parameters<FluxIQ["validateIoRequirements"]>[0] = {};
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
