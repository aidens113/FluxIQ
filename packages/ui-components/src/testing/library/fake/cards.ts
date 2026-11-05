// A made-up library on made-up sites, for building the screen with no Core behind it: a site subflow that
// calls an action subflow that calls a smaller one, one with a fixed value, one with lasting acts, one not
// proven, and one that has failed since.
import type { SubflowCard } from "../../../screens/library/index.ts";

const DAY = 86_400_000;

/** The made-up cards, with the one failure dated three days before `now`. */
export function fakeSubflowCards(now: number = Date.now()): SubflowCard[] {
  return [
    {
      partId: "restock-notebooks",
      version: 2,
      name: "Order notebooks again",
      purpose: "Orders more of a notebook you bought before, from your order history.",
      sites: ["https://paperworks.example"],
      inputs: [{ id: "quantity", name: "How many", required: true }, { id: "note", name: "Delivery note", required: false }],
      outputs: [{ id: "order", name: "Order number", required: true }],
      fixedValues: [],
      lastingClasses: ["move_money", "create_new"],
      startCheck: { conditions: 2, says: "You are signed in and on your order history page." },
      calls: [{ partId: "add-to-basket", version: 1 }],
      trust: { tier: "established", counts: { judgedYes: 2, zeroModelRuns: 5, failures: 0 } }
    },
    {
      partId: "add-to-basket",
      version: 1,
      name: "Add an item to the basket",
      purpose: "Puts one item in the basket and reads the new basket total.",
      sites: ["https://paperworks.example"],
      inputs: [{ id: "item", name: "Item name", required: true }],
      outputs: [{ id: "total", name: "Basket total", required: true }],
      fixedValues: [],
      lastingClasses: ["create_new"],
      calls: [{ partId: "choose-colour", version: 1 }],
      trust: { tier: "provisional", counts: { judgedYes: 1, zeroModelRuns: 0, failures: 1 }, lastFailureAtMs: now - 3 * DAY }
    },
    {
      partId: "choose-colour",
      version: 1,
      name: "Pick the paper colour",
      purpose: "Chooses the paper colour on an item page before it is added.",
      sites: ["https://paperworks.example"],
      inputs: [],
      outputs: [],
      fixedValues: ["Sea green"],
      lastingClasses: ["modify_existing"],
      startCheck: { conditions: 1 },
      calls: [],
      trust: { tier: "established", counts: { judgedYes: 3, zeroModelRuns: 6, failures: 0 } }
    },
    {
      partId: "list-loans",
      version: 1,
      name: "Read my borrowed books",
      purpose: "Lists the books you have on loan and when each is due back.",
      sites: ["https://harbour-library.example"],
      inputs: [{ id: "branch", name: "Branch", required: false }],
      outputs: [{ id: "titles", name: "Titles", required: true }],
      fixedValues: [],
      lastingClasses: [],
      calls: [],
      trust: { tier: "unproven", counts: { judgedYes: 0, zeroModelRuns: 0, failures: 0 } }
    }
  ];
}
