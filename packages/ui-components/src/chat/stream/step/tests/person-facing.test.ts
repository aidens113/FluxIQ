import assert from "node:assert/strict";
import { test } from "vitest";
import { personFacingTextFaults } from "fluxiq/ui";
import type { ActivityProjectCard } from "fluxiq/ui";
import { projectWords } from "..";

test("project chat cards pass the same person-facing text guard as Core activity", () => {
  const cards: ActivityProjectCard[] = [
    { kind: "plan", parts: [{ id: "p", words: "Find a recipe" }], subflows: [{ key: "find_recipe", name: "Find recipes", purpose: "Read the recipes", parts: ["p"] }] },
    { kind: "brief", brief: "build", briefId: "b", subflowKey: "find_recipe", subflowName: "Find recipes", purpose: "Read the recipes", allowanceUsd: 0.05 },
    { kind: "return", briefId: "b", subflowKey: "find_recipe", outcome: "partial", reason: "The page needs a sign-in.", spentUsd: 0.01, calls: 2, trials: 1 },
    { kind: "receipt", receipt: "subflow_trial", receiptId: "r", verdict: "passed" },
    { kind: "receipt", receipt: "candidate_trial", receiptId: "r2", verdict: "failed" }
  ];
  for (const card of cards) {
    const words = projectWords(card, { briefs: new Map(), subflows: new Map() }, undefined);
    const texts = [words.title, words.text, words.card.name, words.card.target, words.card.outcome,
      ...words.card.rows.flatMap((row) => [row.heading, ...row.items])];
    for (const text of texts) {
      if (text) assert.deepEqual(personFacingTextFaults(text), [], text);
    }
  }
});
