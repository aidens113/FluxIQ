import { createHash } from "node:crypto";
import { vi } from "vitest";
import { resetRouteRuntime, routeRequest, runtime } from "../../../../../../../../lib/workspaces/routes/tests/route-runtime";

type Browser = Omit<NonNullable<typeof runtime.browserSession>, "projectId" | "activeRecordingId"> & { projectId: string | null; activeRecordingId: string | null };
type Asset = { content: Uint8Array<ArrayBuffer>; mediaType: string; size: number; sha256: string };
const operations = () => ({ read: vi.fn(), write: vi.fn(), domain: vi.fn(), trace: vi.fn() });
export const PNG_A = new Uint8Array([137, 80, 78, 71, 65]);
export const PNG_B = new Uint8Array([137, 80, 78, 71, 66]);
export const SHA_A = createHash("sha256").update(PNG_A).digest("hex");
export const SHA_B = createHash("sha256").update(PNG_B).digest("hex");
export const assets = {
  a: operations(), b: operations(), primary: operations(),
  browser: null as Browser | null,
  domains: new Map<string, string | null>(),
  owners: new Map<string, string>()
};

export async function resetAssetRuntime() {
  await resetRouteRuntime();
  assets.browser = runtime.browserSession ? { ...runtime.browserSession, metadata: { ...runtime.browserSession.metadata } } : null;
  runtime.tenantA.programs.clientGateway.authorizeToken.mockImplementation(async (token: string) => token === "browser-a-token" ? assets.browser : null);
  assets.domains.clear();
  assets.domains.set("same-project", "domain-a");
  assets.domains.set("foreign-domain-project", "domain-b");
  assets.domains.set("foreign-owner-project", "domain-a");
  assets.owners.clear();
  assets.owners.set("same-project", "person-a");
  assets.owners.set("foreign-owner-project", "person-b");
  runtime.tenantA.programs.api.registerResourceOwners("project", { ownerOf: async id => assets.owners.get(id) ?? null });
  runtime.tenantB.programs.api.registerResourceOwners("project", { ownerOf: async id => id === "same-project" ? "person-b" : null });
  for (const [instance, methods, bytes, sha256] of [[runtime.tenantA, assets.a, PNG_A, SHA_A], [runtime.tenantB, assets.b, PNG_B, SHA_B], [runtime.primary, assets.primary, PNG_A, SHA_A]] as const) {
    Object.assign(instance.programs, { automationStudio: { readProjectObjectAsset: methods.read, writeProjectObjectAsset: methods.write, assertProjectDomainAccess: methods.domain } });
    Object.assign(instance.programs.clientGateway, { receiveTraceArtifact: methods.trace });
    methods.read.mockImplementation(async (projectId: string, requested: string): Promise<Asset> => {
      if (projectId !== "same-project" || requested !== sha256) throw new Error("Synthetic private asset unavailable");
      return { content: bytes, mediaType: "image/png", size: bytes.byteLength, sha256 };
    });
    methods.domain.mockImplementation(async (projectId: string, domainId: string | null) => {
      if (!assets.domains.has(projectId) || assets.domains.get(projectId) !== domainId) throw new Error("Synthetic project-domain refusal");
    });
    methods.write.mockImplementation(async (input: { projectId: string; content: Uint8Array; mediaType: string; expectedSha256: string }) => ({
      sha256: input.expectedSha256, size: input.content.byteLength, mediaType: input.mediaType,
      contentRef: `object:${input.expectedSha256}`, apiPath: `/api/programs/automation-studio/state-assets/${input.projectId}/${input.expectedSha256}`
    }));
  }
}

export function assetParams(projectId = "same-project", sha256 = SHA_A) {
  return { params: Promise.resolve({ projectId, sha256 }) };
}

export function assetRequest(options: {
  method?: "GET" | "PUT"; projectId?: string; sha256?: string; cookie?: string | null; bearer?: string;
  headers?: Record<string, string>; bytes?: Uint8Array<ArrayBuffer>; signal?: AbortSignal; query?: string;
} = {}) {
  const projectId = options.projectId ?? "same-project";
  const sha256 = options.sha256 ?? SHA_A;
  const method = options.method ?? "PUT";
  const bytes = options.bytes ?? PNG_A;
  const base = routeRequest({
    ...(options.cookie === undefined ? {} : { cookie: options.cookie }),
    ...(options.bearer ? { bearer: options.bearer } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
    url: `https://panel.example.test/api/programs/automation-studio/state-assets/${encodeURIComponent(projectId)}/${sha256}${options.query ?? ""}`
  });
  const headers = new Headers(base.headers);
  headers.set("content-type", "image/png");
  headers.set("content-length", String(bytes.byteLength));
  for (const [key, value] of Object.entries(options.headers ?? {})) headers.set(key, value);
  return new Request(base, { method, headers, ...(method === "PUT" ? { body: bytes } : {}) });
}

export function pairedAssetRequest(options: Parameters<typeof assetRequest>[0] = {}) {
  return assetRequest({ cookie: null, bearer: "browser-a-token", ...options });
}
