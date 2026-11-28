// The person's current project and open Flow as Core holds them: one value per person, which the panel
// and every paired client read and write (`POST /api/client-gateway/automation-studio-context`, read back
// in the client snapshot, `GET /api/client-gateway/snapshot`). The panel writes it on every switch and
// adopts it on load, so the extension and the panel agree on which project is current.
//
// A read or write that cannot reach Core, or is refused, says so with the reason (in Core's words when it
// gave some): the caller falls back to what this browser remembered, and never mistakes the failure for
// "Core holds no project".

export type CoreContextValue = { projectId: string | undefined; flowId: string | undefined };

export type CoreContextRead = { ok: true; value: CoreContextValue } | { ok: false; reason: string };

export type CoreContextWrite = { ok: true } | { ok: false; reason: string };

export type CoreContextPort = {
  /** Core's value now, or why it could not be read. */
  read(): Promise<CoreContextRead>;
  /** Sets the person's value: a project with or without a Flow, or none. */
  write(value: CoreContextValue): Promise<CoreContextWrite>;
};

const SNAPSHOT = "/api/client-gateway/snapshot";
const CONTEXT = "/api/client-gateway/automation-studio-context";
const UNREAD = "FluxIQ's current project could not be read.";
const UNWRITTEN = "FluxIQ did not keep the current project.";

type Answer = { ok?: unknown; error?: unknown; payload?: { webRuntime?: { automationStudio?: { activeProjectId?: unknown; activeFlowId?: unknown } } } };

/** The port over this browser's own session, scoped to the domain the page is scoped to, as program requests are. */
export function browserCoreContextPort(): CoreContextPort {
  return {
    async read() {
      const answer = await request(SNAPSHOT, { cache: "no-store" });
      if (!answer.ok) return { ok: false, reason: `${UNREAD} ${answer.reason}` };
      const studio = answer.body.payload?.webRuntime?.automationStudio;
      const projectId = idOf(studio?.activeProjectId);
      return { ok: true, value: { projectId, flowId: projectId === undefined ? undefined : idOf(studio?.activeFlowId) } };
    },
    async write(value) {
      const answer = await request(CONTEXT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activeProjectId: value.projectId ?? null, activeFlowId: value.projectId === undefined ? null : value.flowId ?? null })
      });
      return answer.ok ? { ok: true } : { ok: false, reason: `${UNWRITTEN} ${answer.reason}` };
    }
  };
}

/** One request to Core, answered with its body or with why it failed. */
async function request(path: string, init: RequestInit): Promise<{ ok: true; body: Answer } | { ok: false; reason: string }> {
  let response: Response;
  try {
    response = await fetch(scoped(path), init);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "The panel could not reach FluxIQ." };
  }
  let body: Answer;
  try {
    body = (await response.json()) as Answer;
  } catch (error) {
    return { ok: false, reason: `FluxIQ answered ${response.status} with no readable body${error instanceof Error ? ` (${error.message})` : ""}.` };
  }
  if (response.ok && body.ok === true) return { ok: true, body };
  return { ok: false, reason: typeof body.error === "string" && body.error.trim() ? body.error.trim() : `FluxIQ answered ${response.status}.` };
}

function idOf(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function scoped(path: string): string {
  const domainId = typeof window === "undefined" ? null : new URLSearchParams(window.location?.search ?? "").get("domainId");
  return domainId ? `${path}?domainId=${encodeURIComponent(domainId)}` : path;
}
