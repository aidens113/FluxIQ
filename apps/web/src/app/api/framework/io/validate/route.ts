import { NextResponse } from "next/server";
import { getFluxIQ } from "../../../../../lib/fluxiq";

export async function POST(request: Request) {
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
  const fluxiq = getFluxIQ();
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
