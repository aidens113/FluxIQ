import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@fluxiq/contracts/automation-studio": `${root}/packages/contracts/src/automation-studio.ts`,
      "@fluxiq/contracts/client-gateway": `${root}/packages/contracts/src/client-gateway.ts`,
      "@fluxiq/contracts/core": `${root}/packages/contracts/src/core.ts`,
      "@fluxiq/contracts": `${root}/packages/contracts/src/index.ts`,
      "fluxiq/automation-studio": `${root}/packages/fluxiq/src/programs/automation-studio/index.ts`,
      "fluxiq/client-gateway": `${root}/packages/fluxiq/src/client-gateway/index.ts`,
      "fluxiq/core": `${root}/packages/fluxiq/src/core/index.ts`,
      fluxiq: `${root}/packages/fluxiq/src/index.ts`
    }
  },
  test: {
    passWithNoTests: true
  }
});
