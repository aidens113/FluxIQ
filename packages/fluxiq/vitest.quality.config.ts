import { defineConfig } from "vitest/config";

export default defineConfig({
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
});
