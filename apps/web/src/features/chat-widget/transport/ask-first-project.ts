// The person's project from Core (`POST /api/client-gateway/first-project`), asked by this browser's own
// panel session in the domain its page is scoped to, exactly as a paired browser asks for its own.

import type { ChatResult } from "@fluxiq/ui-components";

const ROUTE = "/api/client-gateway/first-project";
const UNREACHED = "FluxIQ could not find a project for this chat. Try again.";
const NONE = "FluxIQ could not make a project for this chat, so nothing was sent. You may not be allowed to create projects: open one you can use, or ask an administrator.";

type Answer = { ok?: unknown; error?: unknown; payload?: { projectId?: unknown } };

export async function askFirstProject(): Promise<ChatResult<string>> {
  let response: Response;
  try {
    response = await fetch(scoped(ROUTE), { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  } catch (error) {
    return { ok: false, code: "unreachable", sentence: UNREACHED, ...(error instanceof Error ? { detail: error.message } : {}) };
  }
  let body: Answer;
  try {
    body = (await response.json()) as Answer;
  } catch (error) {
    return { ok: false, code: "failed", sentence: UNREACHED, detail: `FluxIQ answered ${response.status} with no readable body${error instanceof Error ? ` (${error.message})` : ""}.` };
  }
  if (!response.ok || body.ok !== true) {
    const detail = typeof body.error === "string" && body.error.trim() ? body.error.trim() : `FluxIQ answered ${response.status}.`;
    return { ok: false, code: response.status === 401 ? "refused" : "failed", sentence: UNREACHED, detail };
  }
  const projectId = body.payload?.projectId;
  if (typeof projectId === "string" && projectId.trim()) return { ok: true, value: projectId.trim() };
  return { ok: false, code: "no_project", sentence: NONE };
}

function scoped(path: string): string {
  const domainId = typeof window === "undefined" ? null : new URLSearchParams(window.location?.search ?? "").get("domainId");
  return domainId ? `${path}?domainId=${encodeURIComponent(domainId)}` : path;
}
