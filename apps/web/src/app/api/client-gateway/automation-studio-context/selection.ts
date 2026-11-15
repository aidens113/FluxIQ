import { ContextRouteError } from "./failure";

export type ContextSelection = Readonly<{ activeProjectId: string | null; activeFlowId: string | null; clientId?: string }>;

export async function readContextSelection(request: Request): Promise<ContextSelection> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ContextRouteError(400, "Context selection must be a JSON object.");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) throw new ContextRouteError(400, "Context selection must be a JSON object.");
  const fields = body as Record<string, unknown>;
  for (const name of ["activeProjectId", "activeFlowId", "clientId"]) {
    const value = fields[name];
    if (value !== undefined && value !== null && typeof value !== "string") throw new ContextRouteError(400, "Context identifiers must be strings or null.");
  }
  const activeProjectId = typeof fields.activeProjectId === "string" ? fields.activeProjectId.trim() || null : null;
  const activeFlowId = activeProjectId && typeof fields.activeFlowId === "string" ? fields.activeFlowId.trim() || null : null;
  const clientId = typeof fields.clientId === "string" ? fields.clientId.trim() || undefined : undefined;
  return Object.freeze({ activeProjectId, activeFlowId, ...(clientId ? { clientId } : {}) });
}
