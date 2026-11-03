// The project supervisor's work in a person's words: each card a `note` row
// carries (`projectCard`) as its message's heading and its card, and each of
// a build's agents as the name of its lane (automation-project-agents-plan,
// chat presentation). Drawn from the card's closed fields, never from Core's
// sentence, and never an id: a brief, a receipt or a case is named by its
// subflow, never by its id. No DOM.
//
//   plan     "Planned 2 subflows" -- card "Plan · 3 parts, 2 subflows /
//            Budget $0.18, $0.07 kept back", and the parts and each subflow
//            with its purpose and allowance under it
//   brief    "Building Search: Find the kettle" (or "Surveying",
//            "Repairing", "Resetting the site") -- card "Build · Search /
//            Allowance $0.06"
//   return   "Built Search" (or "Partly built", "Couldn't build") with the
//            builder's reason in a person's words, never its codes or ids
//            (`return-reason.ts`) -- card "Return · Search / Spent $0.04 · 12
//            calls · 3 trials", or "Not started" for a brief that spent and
//            tried nothing (t649)
//   receipt  "Tested Search" or "Tested the whole Flow" -- card "Subflow
//            trial · Search / Passed" ("Didn't pass", "Not confirmed")
//
// Each card's icon is the one Core pins for the action kind it stands for
// (`ACTIVITY_ACTION_ICONS` in `fluxiq/ui`), so no client draws a new icon: a
// plan branches into subflows (`branch`), a build drafts (`draft`), a survey
// looks (`look`), a repair repairs (`repair`), a reset repeats the start
// (`repeat`), a return joins the plan again (`join`), and a receipt is a test
// (`test`).

import type { ActivityActionKind } from "fluxiq/ui";
import type { ActivityAgent, ActivityProjectCard } from "fluxiq/ui";
import { returnReason } from "./return-reason.ts";

type Brief = Extract<ActivityProjectCard, { kind: "brief" }>;

/** A project card's card, as its view draws it. */
export type ProjectCardWords = {
  /** The action kind whose pinned icon the card shows. */
  icon: ActivityActionKind;
  name: string;
  target: string | null;
  outcome: string | null;
  /** The mark's tint; `working` only until the brief's builder returns. */
  state: "working" | "done" | "failed" | "unconfirmed" | "settled";
  /** Lines under the card, in groups: a plan's parts and its subflows; empty for the other cards. */
  rows: ReadonlyArray<{ heading: string; items: readonly string[] }>;
};

/** A project message's heading and card. */
export type ProjectWords = { title: string; text: string | undefined; card: ProjectCardWords };

/** What earlier cards of the build named, so a later one says a subflow's name rather than its key or id. */
export type ProjectNames = {
  /** Each brief by its id: what it asked and of which subflow. */
  briefs: ReadonlyMap<string, Pick<Brief, "brief" | "subflowName">>;
  /** Each subflow's name by its key, from the plan. */
  subflows: ReadonlyMap<string, string>;
};

const BRIEF_WORDS: Readonly<Record<Brief["brief"], { doing: string; name: string; icon: ActivityActionKind; done: string; partly: string; not: string }>> = {
  build: { doing: "Building", name: "Build", icon: "draft", done: "Built", partly: "Partly built", not: "Couldn't build" },
  survey: { doing: "Surveying", name: "Survey", icon: "look", done: "Surveyed", partly: "Partly surveyed", not: "Couldn't survey" },
  repair: { doing: "Repairing", name: "Repair", icon: "repair", done: "Repaired", partly: "Partly repaired", not: "Couldn't repair" },
  reset: { doing: "Resetting the site", name: "Reset the site", icon: "repeat", done: "Reset the site", partly: "Partly reset the site", not: "Couldn't reset the site" }
};

/** What the return of a brief whose builder never ran says in place of its spending. */
const NOT_STARTED = "Not started";

/** `card` in words; `agent` is the event's author, a last source for a subflow's name. */
export function projectWords(card: ActivityProjectCard, names: ProjectNames, agent: ActivityAgent | undefined): ProjectWords {
  switch (card.kind) {
    case "plan": {
      const budget = new Map((card.budget ?? []).map((entry) => [entry.subflowKey, entry.usd]));
      const cases = new Map<string, number>();
      for (const entry of card.cases ?? []) cases.set(entry.subflowKey, (cases.get(entry.subflowKey) ?? 0) + 1);
      const total = card.budget === undefined ? undefined : card.budget.reduce((sum, entry) => sum + entry.usd, 0) + (card.reserveUsd ?? 0);
      const kept = card.reserveUsd === undefined ? "" : `, ${dollars(card.reserveUsd)} kept back`;
      const subflows = card.subflows.map((subflow) => {
        const extra = [budget.has(subflow.key) ? dollars(budget.get(subflow.key)!) : "", cases.has(subflow.key) ? counted(cases.get(subflow.key)!, "starting case") : ""].filter(Boolean);
        return [subflow.purpose ? `${subflow.name}: ${subflow.purpose}` : subflow.name, ...extra].join(" · ");
      });
      return {
        title: `Planned ${counted(card.subflows.length, "piece")}`,
        text: undefined,
        card: {
          icon: "branch",
          name: "Plan",
          target: `${counted(card.parts.length, "part")}, ${counted(card.subflows.length, "piece")}`,
          outcome: total === undefined ? (card.reserveUsd === undefined ? null : `${dollars(card.reserveUsd)} kept back`) : `Budget ${dollars(total)}${kept}`,
          state: "done",
          rows: [
            ...(card.parts.length === 0 ? [] : [{ heading: "Parts", items: card.parts.map((part) => part.words) }]),
            { heading: "Pieces", items: subflows }
          ]
        }
      };
    }
    case "brief": {
      const words = BRIEF_WORDS[card.brief];
      const doing = card.brief === "reset" ? words.doing : `${words.doing} ${card.subflowName}`;
      return {
        title: card.purpose ? `${doing}: ${card.purpose}` : doing,
        text: undefined,
        card: { icon: words.icon, name: words.name, target: card.subflowName, outcome: `Allowance ${dollars(card.allowanceUsd)}`, state: "working", rows: [] }
      };
    }
    case "return": {
      const brief = names.briefs.get(card.briefId);
      const words = BRIEF_WORDS[brief?.brief ?? "build"];
      const subflow = brief?.subflowName ?? names.subflows.get(card.subflowKey) ?? agent?.subflowName ?? null;
      const head = card.outcome === "done" ? words.done : card.outcome === "partial" ? words.partly : words.not;
      // A brief that never started spent nothing and tried nothing: it says so, not "Spent $0.00 · 0 calls".
      const started = card.calls > 0 || card.trials > 0 || card.spentUsd > 0;
      const spent = started ? [`Spent ${dollars(card.spentUsd)}`, counted(card.calls, "call"), counted(card.trials, "test")].join(" · ") : NOT_STARTED;
      return {
        title: brief?.brief === "reset" || subflow === null ? head : `${head} ${subflow}`,
        // The builder's reason is written for the supervisor: said in a person's words, never its codes or ids (`return-reason.ts`).
        text: returnReason(card.reason, names),
        card: { icon: "join", name: "Return", target: subflow, outcome: spent, state: card.outcome === "done" ? "done" : card.outcome === "partial" ? "unconfirmed" : "failed", rows: [] }
      };
    }
    case "receipt": {
      const whole = card.receipt === "candidate_trial";
      const subflow = whole ? null : (card.briefId === undefined ? undefined : names.briefs.get(card.briefId)?.subflowName) ?? agent?.subflowName ?? null;
      const outcome = card.verdict === "passed" ? "Passed" : card.verdict === "failed" ? "Didn't pass" : "Not confirmed";
      return {
        title: whole ? "Tested the whole Flow" : subflow === null ? "Tested one part" : `Tested ${subflow}`,
        text: undefined,
        card: { icon: "test", name: whole ? "Whole-Flow run" : "Part test", target: subflow, outcome, state: card.verdict === "passed" ? "done" : card.verdict === "failed" ? "failed" : "unconfirmed", rows: [] }
      };
    }
  }
}

/** The name of the lane `agent`'s steps run in: "Builder · Search", "Validator", "Supervisor". */
export function laneWords(agent: ActivityAgent): string {
  const role = agent.role === "supervisor" ? "Supervisor" : agent.role === "builder" ? "Builder" : agent.role === "repair" ? "Repair" : "Validator";
  return agent.subflowName === undefined || agent.role === "supervisor" ? role : `${role} · ${agent.subflowName}`;
}

/** "$0.06"; an amount under a cent that is not nothing is "under $0.01". */
function dollars(usd: number): string {
  return usd > 0 && usd < 0.005 ? "under $0.01" : `$${usd.toFixed(2)}`;
}

/** "1 subflow", "3 subflows". */
function counted(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
