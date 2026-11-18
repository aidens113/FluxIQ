// @fluxiq-test-group real-sql
import { afterEach, describe, expect, it } from "vitest";
import { ClientGatewayTrustedClientRegistry, resolveClientGatewayConfig } from "../../../client-gateway/service/index.ts";
import { browserTrustFixture } from "./browser-trust-fixture.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("concurrent gateway trust persistence", () => {
  it("cannot let a failed earlier rotation roll memory back over a later published credential", async () => {
    const f = await browserTrustFixture(cleanups);
    const scoped = f.repository.scopedStore("workspace.first");
    let failNext = false;
    let entered: () => void = () => undefined;
    let rejectSave: () => void = () => undefined;
    const saveEntered = new Promise<void>((resolve) => { entered = resolve; });
    const failingSave = new Promise<void>((_resolve, reject) => { rejectSave = () => reject(new Error("synthetic held save rejection")); });
    const registry = new ClientGatewayTrustedClientRegistry(resolveClientGatewayConfig({
      now: () => f.clock.now,
      trustedClientStore: {
        load: () => scoped.load(),
        save: async (clients) => {
          if (failNext) {
            failNext = false;
            entered();
            await failingSave;
          }
          await scoped.save(clients);
        }
      }
    }));
    await registry.ready();
    const granted = await registry.register({ clientId: "extension.synthetic", clientType: "extension", name: "Synthetic browser", approvedByUserId: "user.synthetic", domainId: null });
    failNext = true;
    const first = registry.rotateToken(granted.trustedClient, granted.token);
    const failure = expect(first).rejects.toThrow("synthetic held save rejection");
    await saveEntered;
    const second = registry.rotateToken(granted.trustedClient, granted.token);
    await new Promise<void>((resolve) => setImmediate(resolve));
    rejectSave();
    await failure;
    const published = await second;
    expect(await f.openRepository().lookupCredential(published)).toMatchObject({ status: "current" });
    expect(registry.resolveByToken(published)).toBe(granted.trustedClient);
    expect(registry.isCurrentToken(granted.trustedClient, published)).toBe(true);
  });
});
