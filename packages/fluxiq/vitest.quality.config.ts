import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config.ts";

// Inherits `vitest.config.ts`, so `@fluxiq/contracts` resolves to its source here too.
export default mergeConfig(base, defineConfig({
  test: {
    include: ["src/programs/tests/index.test.ts", "src/programs/tests/permission-matrix.test.ts", "src/programs/_shared/tests/storage.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/programs/_shared/api.ts", "src/programs/_shared/storage.ts"],
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage/quality",
      thresholds: { statements: 65, branches: 70, functions: 60, lines: 65 }
    }
  }
}));
