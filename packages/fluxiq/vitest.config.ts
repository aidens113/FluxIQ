import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
import { testGroupOptions } from "./tests/test-groups.ts";

// `@fluxiq/contracts` resolves to its source here, as `tsconfig.base.json`'s
// `paths` resolve it for tsc. Its package exports name the compiled `dist`,
// which is untracked and which nothing in `vitest run` rebuilds: the
// 2026-10-17 sweep read a contracts dist built before the host-lease refusal
// codes existed, so 18 tests failed on an undefined
// `CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES` while tsc passed (t695).
// `packages/client-gateway-websocket/vitest.config.ts` does the same.
// `vitest.quality.config.ts` inherits it. Guarded by `tests/vitest-config.test.ts`.
const contractsSource = fileURLToPath(new URL("../contracts/src/", import.meta.url));
const packageRoot = fileURLToPath(new URL(".", import.meta.url));

// `pnpm test` runs this package in two groups, one after the other
// (`scripts/vitest-groups.mjs` sets `FLUXIQ_TEST_GROUP`): every file without the
// real-SQL marker at full concurrency, then the marked files with few workers, so
// the whole run never starves a real-SQLite test into a timeout. A plain
// `vitest run <path>` sets no group and runs what it names. The guard setup file
// fails a file that opens a real database without the marker. See
// `tests/test-groups.ts` and docs/architecture/code-structure.md, Test groups.
const group = testGroupOptions(process.env.FLUXIQ_TEST_GROUP, packageRoot, configDefaults.exclude);

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@fluxiq\/contracts$/u, replacement: `${contractsSource}index.ts` },
      { find: /^@fluxiq\/contracts\/(.+)$/u, replacement: `${contractsSource}$1.ts` }
    ]
  },
  test: {
    hookTimeout: 15_000,
    testTimeout: 15_000,
    setupFiles: ["./tests/real-sql-guard.ts"],
    ...group
  }
});
