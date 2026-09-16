import type { GlobalProgramApiRegistry } from "../../_shared/api.ts";
import { DOCS_ENDPOINTS, type DocsPageRequest, type RegisterDocsSourceRequest } from "./contracts.ts";
import type { DocsService } from "../runtime/service.ts";

export function registerDocsApi(registry: GlobalProgramApiRegistry, service: DocsService): void {
  registry.register({
    programId: "docs",
    endpoint: DOCS_ENDPOINTS.snapshot,
    permission: "programs.read",
    classification: "read",
    handler: async () => ({ ok: true, payload: await service.snapshot() })
  });
  registry.register({
    programId: "docs",
    endpoint: DOCS_ENDPOINTS.rebuild,
    permission: "data.manage",
    classification: "authoring",
    handler: async () => ({ ok: true, payload: await service.rebuild() })
  });
  registry.register({
    programId: "docs",
    endpoint: DOCS_ENDPOINTS.getPage,
    permission: "programs.read",
    classification: "read",
    handler: async (request) => {
      const payload = request.payload as DocsPageRequest | undefined;
      if (!payload?.pageId) return { ok: false, error: "pageId is required" };
      return { ok: true, payload: await service.getPage(payload.pageId) };
    }
  });
  registry.register({
    programId: "docs",
    endpoint: DOCS_ENDPOINTS.registerSource,
    permission: "data.manage",
    classification: "authoring",
    handler: async (request) => {
      const payload = request.payload as RegisterDocsSourceRequest | undefined;
      if (!payload?.id || !payload.title || !payload.rootDir) return { ok: false, error: "id, title, and rootDir are required" };
      return { ok: true, payload: await service.upsertSource(payload) };
    }
  });
}
