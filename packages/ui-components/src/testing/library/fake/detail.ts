import type { SubflowCallNode, SubflowCard, SubflowDetail, SubflowStep } from "../../../screens/library/index.ts";

const STEPS: Readonly<Record<string, SubflowStep[]>> = {
  "restock-notebooks": [
    { label: "Open the order history", lastingClasses: [] },
    { label: "Find the notebook", lastingClasses: [] },
    { label: "Add it to the basket", lastingClasses: ["create_new"] },
    { label: "Place the order", lastingClasses: ["move_money"] }
  ],
  "add-to-basket": [
    { label: "Pick the colour", lastingClasses: ["modify_existing"] },
    { label: "Press Add to basket", lastingClasses: ["create_new"] },
    { label: "Read the basket total", lastingClasses: [] }
  ],
  "choose-colour": [{ label: "Open the colour list", lastingClasses: [] }, { label: "Choose the colour", lastingClasses: ["modify_existing"] }],
  "list-loans": [{ label: "Open My loans", lastingClasses: [] }, { label: "Read each book and its due date", lastingClasses: [] }]
};

/** What a subflow calls, and what that calls in turn, by the cards given. A call to a card not given is left out. */
function callsOf(card: SubflowCard, cards: readonly SubflowCard[], path: readonly string[]): SubflowCallNode[] {
  return card.calls.flatMap((call) => {
    const callee = cards.find((item) => item.partId === call.partId);
    if (callee === undefined || path.includes(callee.partId)) return [];
    return [{ partId: callee.partId, version: callee.version, name: callee.name, calls: callsOf(callee, cards, [...path, card.partId]) }];
  });
}

/** One subflow opened, as Core would answer it: steps, what it calls, and who calls it (an automation too, for the one that orders). */
export function fakeSubflowDetail(card: SubflowCard, cards: readonly SubflowCard[]): SubflowDetail {
  const callers: SubflowDetail["callers"] = cards
    .filter((item) => item.calls.some((call) => call.partId === card.partId))
    .map((item) => ({ kind: "part" as const, partId: item.partId }));
  if (card.partId === "restock-notebooks") callers.push({ kind: "flow" });
  return { card, steps: STEPS[card.partId] ?? [{ label: "Do what it is for", lastingClasses: card.lastingClasses }], calls: callsOf(card, cards, [card.partId]), callers };
}
