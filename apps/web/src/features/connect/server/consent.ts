import { cookies } from "next/headers";
import { parseConnectDoneFragment, resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";
import { getConnectService, validateConnectApproval, authorizeConnectConsent } from "../../../server/connect";
import { connectRequestFromParams, type ConnectConsentView } from "../model";
import { connectSessionDigest, createConsentEvidence, matchesConsentEvidence } from "./consent-evidence";
import { readConnectBody } from "./read-body";
import { connectJson, connectRedirect } from "./response";

/** Query-only read. Visiting consent never calls authorize or spends an authorization code. */
export async function prepareConnectConsent(params: URLSearchParams): Promise<ConnectConsentView> {
  try {
    const settings = resolveFluxIQDeploymentSettings(process.env);
    if (settings.profile !== "service") return { kind: "unavailable" };
    const request = connectRequestFromParams(params, settings.publicOrigin);
    if (!request) return { kind: "invalid" };
    const rawCookie = (await cookies()).get(settings.session.name)?.value;
    if (!rawCookie) return { kind: "login", signUpUrl: signUpUrl(request, settings.publicOrigin) };
    const approval = await validateConnectApproval(connectSessionDigest(rawCookie));
    if (!approval.allowed) return { kind: "refused", message: approval.error === "email_unverified" ? "Verify your email before connecting this browser." : "This sign-in cannot connect a browser. Sign in again or ask your workspace administrator." };
    return { kind: "consent", request, evidence: createConsentEvidence(request, rawCookie), user: approval.user, workspace: approval.workspace };
  } catch {
    return { kind: "refused", message: "Browser connection is temporarily unavailable. Try again later." };
  }
}

/** An authenticated, query-bound same-origin consent POST is the only page path that issues a code. */
export async function submitConnectConsent(request: Request): Promise<Response> {
  try {
    const settings = resolveFluxIQDeploymentSettings(process.env);
    if (settings.profile !== "service") return connectJson({ error: "temporarily_unavailable" }, 404);
    if (request.headers.get("origin") !== settings.publicOrigin || (request.headers.get("sec-fetch-site") !== null && request.headers.get("sec-fetch-site") !== "same-origin")) return connectJson({ error: "invalid_request" }, 403);
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/x-www-form-urlencoded") return connectJson({ error: "invalid_request" }, 415);
    const body = await readConnectBody(request);
    if (!body.ok) return connectJson({ error: "invalid_request" }, body.status);
    const form = new URLSearchParams(body.text);
    const authorization = connectRequestFromParams(form, settings.publicOrigin);
    if (!authorization || form.getAll("decision").length !== 1 || form.getAll("consent_evidence").length !== 1 || !["approve", "deny"].includes(form.get("decision") ?? "")) return connectJson({ error: "invalid_request" }, 400);
    const rawCookie = (await cookies()).get(settings.session.name)?.value;
    if (!rawCookie) return connectJson({ error: "invalid_grant" }, 401);
    if (!matchesConsentEvidence(form.get("consent_evidence"), authorization, rawCookie)) return connectJson({ error: "invalid_request" }, 403);
    const admitted = await authorizeConnectConsent(rawCookie);
    if (!admitted.allowed) return connectJson({ error: "invalid_grant" }, admitted.status);
    if (form.get("decision") === "deny") return connectRedirect(doneLocation(authorization.redirect_uri, { error: "access_denied", state: authorization.state }));
    const service = await getConnectService();
    const result = await service.authorize(authorization, connectSessionDigest(rawCookie));
    if (!result.ok) return connectRedirect(doneLocation(authorization.redirect_uri, { error: "server_error", state: authorization.state }));
    if (result.authorization.redirectUri !== authorization.redirect_uri || result.authorization.state !== authorization.state) return connectJson({ error: "temporarily_unavailable" }, 503);
    return connectRedirect(doneLocation(authorization.redirect_uri, { code: result.authorization.code, state: authorization.state }));
  } catch {
    return connectJson({ error: "temporarily_unavailable" }, 503);
  }
}

function doneLocation(redirectUri: string, fragment: Record<string, string>): string {
  const target = new URL(redirectUri);
  target.hash = new URLSearchParams(fragment).toString();
  if (!parseConnectDoneFragment(target.hash)) throw new Error("Invalid connection handoff.");
  return target.href;
}

function signUpUrl(request: Parameters<typeof createConsentEvidence>[0], origin: string): string | null {
  const configured = process.env.FLUXIQ_SIGN_UP_URL?.trim();
  if (!configured) return null;
  const target = new URL(configured);
  if (target.protocol !== "https:") throw new Error("Browser account creation is not configured correctly.");
  const current = new URL("/connect/authorize", origin);
  for (const [field, value] of Object.entries(request)) current.searchParams.set(field, value);
  target.searchParams.set("continue", `${current.pathname}${current.search}`);
  return target.href;
}
