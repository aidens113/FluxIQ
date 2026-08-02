import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
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
