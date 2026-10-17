import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// `@fluxiq/contracts` resolves to its source here, as `tsconfig.base.json`'s
// `paths` resolve it for tsc. Its package exports name the compiled `dist`,
// which is untracked and which nothing in `vitest run` rebuilds: the
// 2026-10-17 sweep read a contracts dist built before the host-lease refusal
// codes existed, so 18 tests failed on an undefined
// `CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES` while tsc passed (t695).
// `packages/client-gateway-websocket/vitest.config.ts` does the same.
// `vitest.quality.config.ts` inherits it. Guarded by `tests/vitest-config.test.ts`.
const contractsSource = fileURLToPath(new URL("../contracts/src/", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@fluxiq\/contracts$/u, replacement: `${contractsSource}index.ts` },
      { find: /^@fluxiq\/contracts\/(.+)$/u, replacement: `${contractsSource}$1.ts` }
    ]
  },
  test: {
    hookTimeout: 15_000,
    testTimeout: 15_000
  }
});
