// Coverage of project-card.ts: each of the four cards is read from a `note`
// row in the contract's shape; on any other row, or in another shape, there is
// no card, and a list keeps only its well-formed entries, at most 20.

import { expect, test } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { projectCard } from "../project-card.ts";

type Detail = NonNullable<ClientGatewayActivity["detail"]>;

function event(project: unknown, kind: Detail["kind"] = "note"): ClientGatewayActivity {
  return {
    activityId: "build-1",
    sequence: 1,
    subject: { kind: "build", id: "build-1", projectId: "p" },
    phase: "building",
    label: "Working",
    at: "2026-10-13T12:00:00.000Z",
    detail: { kind, title: "Supervisor", project: project as NonNullable<Detail["project"]> }
  };
}

const PLAN = {
  kind: "plan",
  parts: [{ id: "p1", words: "Find the kettle" }, { id: "p2", words: "Add it to the cart" }],
  subflows: [{ key: "search", name: "Search", purpose: "Find the kettle", parts: ["p1"] }, { key: "cart", name: "Cart", purpose: "Add it", parts: ["p2"] }],
  cases: [{ subflowKey: "search", caseId: "case-1" }],
  budget: [{ subflowKey: "search", usd: 0.06 }, { subflowKey: "cart", usd: 0.05 }],
  reserveUsd: 0.07
};

test("each card of the contract is read from a note row", () => {
  expect(projectCard(event(PLAN))).toStrictEqual(PLAN);
  const brief = { kind: "brief", briefId: "b1", brief: "build", subflowKey: "search", subflowName: "Search", purpose: "Find the kettle", caseId: "case-1", allowanceUsd: 0.06 };
  expect(projectCard(event(brief))).toStrictEqual(brief);
  const returned = { kind: "return", briefId: "b1", subflowKey: "search", outcome: "partial", reason: "The cart needs a sign-in.", spentUsd: 0.04, calls: 12, trials: 3 };
  expect(projectCard(event(returned))).toStrictEqual(returned);
  const receipt = { kind: "receipt", briefId: "b1", receipt: "subflow_trial", receiptId: "r1", verdict: "passed" };
  expect(projectCard(event(receipt))).toStrictEqual(receipt);
  expect(projectCard(event({ kind: "receipt", receipt: "candidate_trial", receiptId: "r2", verdict: "unconfirmed" }))).toStrictEqual({ kind: "receipt", receipt: "candidate_trial", receiptId: "r2", verdict: "unconfirmed" });
});

test("on any row but a note, or in another shape, there is no card", () => {
  expect(projectCard(event(PLAN, "step"))).toBe(undefined);
  expect(projectCard(event(undefined))).toBe(undefined);
  expect(projectCard(event("plan"))).toBe(undefined);
  expect(projectCard(event({ kind: "estimate" }))).toBe(undefined);
  expect(projectCard(event({ ...PLAN, subflows: [] })), "a plan of no subflows is no plan").toBe(undefined);
  expect(projectCard(event({ kind: "brief", briefId: "b1", brief: "deploy", subflowKey: "s", subflowName: "S", purpose: "", allowanceUsd: 0.1 }))).toBe(undefined);
  expect(projectCard(event({ kind: "brief", briefId: "b1", brief: "build", subflowKey: "s", subflowName: "S", purpose: "", allowanceUsd: -1 }))).toBe(undefined);
  expect(projectCard(event({ kind: "return", briefId: "b1", subflowKey: "s", outcome: "done", reason: "", spentUsd: Number.NaN, calls: 1, trials: 1 }))).toBe(undefined);
  expect(projectCard(event({ kind: "receipt", receipt: "subflow_trial", receiptId: "r1", verdict: "maybe" }))).toBe(undefined);
});

test("a plan keeps only its well-formed entries, at most 20 of each list", () => {
  const card = projectCard(event({
    kind: "plan",
    parts: [{ id: "p1", words: "  Find it  " }, { id: "", words: "no id" }, "p3"],
    subflows: Array.from({ length: 25 }, (_, index) => ({ key: `s${index}`, name: `Subflow ${index}`, purpose: 4, parts: ["p1", 2] })),
    budget: [{ subflowKey: "s0", usd: "0.1" }, { subflowKey: "s1", usd: 0.1 }],
    reserveUsd: -0.5
  }));
  expect(card?.kind).toBe("plan");
  if (card?.kind !== "plan") return;
  expect(card.parts).toStrictEqual([{ id: "p1", words: "Find it" }]);
  expect(card.subflows.length).toBe(20);
  expect(card.subflows[0]).toStrictEqual({ key: "s0", name: "Subflow 0", purpose: "", parts: ["p1"] });
  expect(card.budget).toStrictEqual([{ subflowKey: "s1", usd: 0.1 }]);
  expect("reserveUsd" in card).toBe(false);
  expect("cases" in card).toBe(false);
});

// t649: a brief card names the parts it starts after (`after`), empty for none; an older Core sends none.
test("a brief card's parts it starts after are kept as names, an empty list too, and absent stays absent", () => {
  const brief = { kind: "brief", briefId: "b1", brief: "build", subflowKey: "cart", subflowName: "Cart", purpose: "Add it", allowanceUsd: 0.05 };
  expect(projectCard(event({ ...brief, after: ["Search", " ", 3, "Sign in"] }))).toStrictEqual({ ...brief, after: ["Search", "Sign in"] });
  expect(projectCard(event({ ...brief, after: [] }))).toStrictEqual({ ...brief, after: [] });
  expect(projectCard(event(brief))).toStrictEqual(brief);
});
