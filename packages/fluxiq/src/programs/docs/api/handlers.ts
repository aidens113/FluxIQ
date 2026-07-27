import type { GlobalProgramApiRegistry } from "../../_shared/api";
import { DOCS_ENDPOINTS } from "./contracts";
import type { DocsService } from "../runtime/service";

export function registerDocsApi(registry: GlobalProgramApiRegistry, service: DocsService): void {
  registry.register({
    programId: "docs",
    endpoint: DOCS_ENDPOINTS.snapshot,
    handler: async () => ({ ok: true, payload: await service.snapshot() })
  });
}
