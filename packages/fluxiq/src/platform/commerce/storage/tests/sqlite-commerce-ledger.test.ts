// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { SQLiteRepository } from "../../../../framework/persistence/repository/sqlite-repository.ts";
import { CommerceConflictError } from "../../model/index.ts";
import { checkout as recorded, event } from "../../tests/fixtures.ts";
import { SQLiteCommerceLedger } from "../index.ts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function ledger(): Promise<{ rootDir: string; store: SQLiteCommerceLedger }> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-commerce-"));
  roots.push(rootDir);
  return { rootDir, store: new SQLiteCommerceLedger({ rootDir, now: () => 2_000 }) };
}

it("persists snapshots, event receipts and immutable customer bindings across reopen", async () => {
  const { store, rootDir } = await ledger();
  const input = event("first");
  expect(await store.applyVerifiedEvent(input)).toMatchObject({ outcome: "applied", duplicate: false, recordedAtMs: 2_000 });
  const reopened = new SQLiteCommerceLedger({ rootDir, now: () => 3_000 });
  expect(await reopened.applyVerifiedEvent(input)).toMatchObject({ outcome: "applied", duplicate: true, recordedAtMs: 2_000 });
  expect(await reopened.getEvent(input.providerId, input.eventId)).toMatchObject({ event: input, receipt: { version: 1 } });
  expect(await reopened.getSubscription(input.providerId, "subscription-a")).toMatchObject({ accountId: "account-a", status: "active", version: 1 });
  expect(await reopened.listSubscriptions("account-a")).toHaveLength(1);
  expect(await reopened.listSubscriptions("account-b")).toEqual([]);
  await expect(reopened.applyVerifiedEvent(event("switched", 1, { accountId: "account-b", subscriptionId: "subscription-b" })))
    .rejects.toMatchObject({ code: "customer-rebound" });
});

it("rejects reuse of provider/event identity with changed raw or normalized payload", async () => {
  const { store } = await ledger();
  await store.applyVerifiedEvent(event("immutable"));
  const changedPayload = event("immutable");
  changedPayload.payloadSha256 = "b".repeat(64);
  await expect(store.applyVerifiedEvent(changedPayload)).rejects.toMatchObject({ code: "event-reused" });
  await expect(store.applyVerifiedEvent(event("immutable", 2, { status: "canceled" }))).rejects.toBeInstanceOf(CommerceConflictError);
  expect(await store.getSubscription("fixture-provider", "subscription-a")).toMatchObject({ version: 1, status: "active" });
});

it("retains revocation despite delayed active delivery and restart, ordering only by explicit version", async () => {
  const { rootDir, store } = await ledger();
  await store.applyVerifiedEvent(event("revoked", 8, { status: "canceled", verifiedAtMs: 1_200, paidThroughMs: null }));
  const reordered = event("old-active", 7, { verifiedAtMs: 1_900 });
  expect(await store.applyVerifiedEvent(reordered)).toMatchObject({ outcome: "stale" });
  const reopened = new SQLiteCommerceLedger({ rootDir });
  expect(await reopened.getSubscription("fixture-provider", "subscription-a")).toMatchObject({ version: 8, status: "canceled" });
  expect(await reopened.applyVerifiedEvent(reordered)).toMatchObject({ outcome: "stale", duplicate: true });
  expect(await reopened.applyVerifiedEvent(event("paid-again", 9))).toMatchObject({ outcome: "applied" });
});

it("accepts equal-version reconciliation only when the complete snapshot is unchanged", async () => {
  const { store } = await ledger();
  await store.applyVerifiedEvent(event("original", 3));
  expect(await store.applyVerifiedEvent(event("reconciled", 3))).toMatchObject({ outcome: "unchanged" });
  await expect(store.applyVerifiedEvent(event("bad-sequence", 3, { status: "canceled" }))).rejects.toMatchObject({ code: "version-reused" });
  expect(await store.getEvent("fixture-provider", "bad-sequence")).toBeNull();
});

it("refuses a subscription switching account or customer, including stale events", async () => {
  const { store } = await ledger();
  await store.applyVerifiedEvent(event("original", 5));
  await expect(store.applyVerifiedEvent(event("rebind", 6, { accountId: "account-b", customerId: "customer-b" })))
    .rejects.toMatchObject({ code: "subscription-rebound" });
  await expect(store.applyVerifiedEvent(event("old-rebind", 2, { customerId: "customer-b" })))
    .rejects.toMatchObject({ code: "subscription-rebound" });
  expect(await store.listSubscriptions("account-b")).toEqual([]);
  expect(await store.getEvent("fixture-provider", "rebind")).toBeNull();
  await expect(store.applyVerifiedEvent(event("valid-b", 1, { accountId: "account-b", customerId: "customer-b", subscriptionId: "subscription-b" })))
    .resolves.toMatchObject({ outcome: "applied" });
});

it("atomically rolls back snapshot, linkage and dedup record if the final event write fails", async () => {
  const { store, rootDir } = await ledger();
  await store.listSubscriptions("account-a");
  const repository = new SQLiteRepository({ rootDir, kind: "platform.commerce" });
  await repository.transaction({}, async (tx) => {
    await tx.run(`CREATE TRIGGER refuse_event BEFORE INSERT ON "platform.commerce"
      WHEN NEW.id LIKE 'event/%' BEGIN SELECT RAISE(ABORT, 'event insert refused'); END`);
  });
  await expect(store.applyVerifiedEvent(event("atomic"))).rejects.toThrow("event insert refused");
  expect(await store.getSubscription("fixture-provider", "subscription-a")).toBeNull();
  expect(await store.getEvent("fixture-provider", "atomic")).toBeNull();
  expect(await store.listSubscriptions("account-a")).toEqual([]);
  await repository.transaction({}, async (tx) => { await tx.run("DROP TRIGGER refuse_event"); });
  // A different account can bind the customer: the failed transaction left no linkage.
  expect(await store.applyVerifiedEvent(event("atomic", 1, { accountId: "account-b" }))).toMatchObject({ outcome: "applied", duplicate: false });
});

it("deduplicates concurrent connections and retains the greatest concurrent subscription version", async () => {
  const { store, rootDir } = await ledger();
  const other = new SQLiteCommerceLedger({ rootDir, now: () => 2_100 });
  const duplicates = await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 === 0 ? store : other).applyVerifiedEvent(event("concurrent"))));
  expect(duplicates.filter((result) => !result.duplicate)).toHaveLength(1);
  const versions = [4, 2, 7, 3, 6, 5];
  await Promise.all(versions.map((version, index) => (index % 2 === 0 ? store : other).applyVerifiedEvent(event(`version-${version}`, version, {
    status: version === 7 ? "canceled" : "active"
  }))));
  expect(await store.getSubscription("fixture-provider", "subscription-a")).toMatchObject({ version: 7, status: "canceled" });
});

it("scopes event and customer identifiers by provider without crossing account indexes", async () => {
  const { store } = await ledger();
  await store.applyVerifiedEvent(event("same"));
  const second = event("same", 1, { accountId: "account-b" });
  second.providerId = "other-provider";
  expect(await store.applyVerifiedEvent(second)).toMatchObject({ outcome: "applied", duplicate: false });
  expect(await store.listSubscriptions("account-a")).toMatchObject([{ providerId: "fixture-provider" }]);
  expect(await store.listSubscriptions("account-b")).toMatchObject([{ providerId: "other-provider" }]);
});

it("copies queued input before a caller can mutate subscription state", async () => {
  const { store } = await ledger();
  const input = event("copy");
  const applying = store.applyVerifiedEvent(input);
  input.subscription.status = "canceled";
  input.subscription.version = 99;
  await applying;
  expect(await store.getSubscription("fixture-provider", "subscription-a")).toMatchObject({ status: "active", version: 1 });
});

it("applies a compare-and-set reconciliation only over the version it read, recording nothing when superseded", async () => {
  const { store } = await ledger();
  await expect(store.applyVerifiedEvent(event("first", 1), { expectedPreviousVersion: 1 })).rejects.toMatchObject({ code: "version-superseded" });
  expect(await store.getEvent("fixture-provider", "first")).toBeNull();
  expect(await store.applyVerifiedEvent(event("first", 1), { expectedPreviousVersion: 0 })).toMatchObject({ outcome: "applied" });
  await expect(store.applyVerifiedEvent(event("lost-race", 2), { expectedPreviousVersion: 0 })).rejects.toMatchObject({ code: "version-superseded" });
  expect(await store.getEvent("fixture-provider", "lost-race")).toBeNull();
  expect(await store.applyVerifiedEvent(event("lost-race", 2), { expectedPreviousVersion: 1 })).toMatchObject({ outcome: "applied", version: 2 });
  await expect(store.applyVerifiedEvent(event("bad", 3), { expectedPreviousVersion: -1 })).rejects.toBeInstanceOf(TypeError);
});

it("lists one provider's subscriptions for reconciliation and keeps providers apart", async () => {
  const { store } = await ledger();
  await store.applyVerifiedEvent(event("a"));
  await store.applyVerifiedEvent({ ...event("b", 1, { customerId: "customer-b", subscriptionId: "subscription-b" }), providerId: "other-provider" });
  expect((await store.listProviderSubscriptions("fixture-provider")).map((row) => [row.providerId, row.subscriptionId])).toEqual([["fixture-provider", "subscription-a"]]);
  expect((await store.listProviderSubscriptions("other-provider")).map((row) => row.subscriptionId)).toEqual(["subscription-b"]);
});

it("records checkouts idempotently per account, refuses a changed one and survives reopen", async () => {
  const { store, rootDir } = await ledger();
  const checkout = recorded({ expiresAtMs: 2_000 });
  await store.recordCheckout(checkout);
  await store.recordCheckout({ ...checkout });
  await expect(store.recordCheckout({ ...checkout, expiresAtMs: 9_000 })).rejects.toMatchObject({ code: "checkout-reused" });
  await expect(store.recordCheckout({ ...checkout, checkoutId: "cs-2", expiresAtMs: 1_000 })).rejects.toBeInstanceOf(TypeError);
  const reopened = new SQLiteCommerceLedger({ rootDir });
  expect(await reopened.listCheckouts("account-a")).toEqual([checkout]);
  expect(await reopened.listCheckouts("account-b")).toEqual([]);
  expect(await reopened.getCheckout("fixture-provider", "cs-1")).toEqual(checkout);
  expect(await reopened.getCheckout("fixture-provider", "cs-unknown")).toBeNull();
  // A checkout id is one account's: another account cannot record it, and a checkout is recorded as created.
  await expect(store.recordCheckout({ ...checkout, accountId: "account-b" })).rejects.toMatchObject({ code: "checkout-reused" });
  await expect(store.recordCheckout(recorded({ checkoutId: "cs-3", subscriptionId: "sub-1", completedAtMs: 1_500 }))).rejects.toBeInstanceOf(TypeError);
});

it("completes a checkout once, binding its subscription to the checkout's account and to no other", async () => {
  const { store } = await ledger();
  await store.recordCheckout(recorded());
  await store.recordCheckout(recorded({ accountId: "account-b", checkoutId: "cs-b" }));
  expect(await store.subscriptionAccount("fixture-provider", "subscription-a")).toBeNull();
  const completion = { providerId: "fixture-provider", checkoutId: "cs-1", subscriptionId: "subscription-a", completedAtMs: 1_500 };
  expect(await store.completeCheckout(completion)).toMatchObject({ subscriptionId: "subscription-a", completedAtMs: 1_500, expiredAtMs: null });
  expect(await store.completeCheckout({ ...completion, completedAtMs: 1_900 })).toMatchObject({ completedAtMs: 1_500 });
  expect(await store.subscriptionAccount("fixture-provider", "subscription-a")).toBe("account-a");
  await expect(store.completeCheckout({ ...completion, subscriptionId: "subscription-z" })).rejects.toMatchObject({ code: "checkout-reused" });
  await expect(store.completeCheckout({ ...completion, checkoutId: "cs-b" })).rejects.toMatchObject({ code: "subscription-rebound" });
  expect(await store.completeCheckout({ ...completion, checkoutId: "cs-unknown" })).toBeNull();
  // A snapshot naming another account than the binding is refused.
  await expect(store.applyVerifiedEvent(event("forged", 1, { accountId: "account-b", customerId: "customer-b" }))).rejects.toMatchObject({ code: "subscription-rebound" });
  expect(await store.applyVerifiedEvent(event("bound", 1))).toMatchObject({ outcome: "applied" });
  expect(await store.customerAccount("fixture-provider", "customer-a")).toBe("account-a");
  expect(await store.customerAccount("fixture-provider", "customer-z")).toBeNull();
});

it("expires an open checkout, leaves a completed one, and lets a completion outrank an expiry", async () => {
  const { store } = await ledger();
  await store.recordCheckout(recorded());
  await store.recordCheckout(recorded({ checkoutId: "cs-2" }));
  expect(await store.expireCheckout("fixture-provider", "cs-1", 1_200)).toMatchObject({ expiredAtMs: 1_200 });
  expect(await store.expireCheckout("fixture-provider", "cs-1", 1_300)).toMatchObject({ expiredAtMs: 1_200 });
  await store.completeCheckout({ providerId: "fixture-provider", checkoutId: "cs-2", subscriptionId: "subscription-a", completedAtMs: 1_400 });
  expect(await store.expireCheckout("fixture-provider", "cs-2", 1_500)).toMatchObject({ completedAtMs: 1_400, expiredAtMs: null });
  expect(await store.completeCheckout({ providerId: "fixture-provider", checkoutId: "cs-1", subscriptionId: "subscription-b", completedAtMs: 1_600 })).toMatchObject({ completedAtMs: 1_600, expiredAtMs: null });
  expect(await store.expireCheckout("fixture-provider", "cs-unknown", 1_500)).toBeNull();
});
