// A FluxNode run's settings as the Answer First attempt takes them (`AutomationStudioAnswerFirstCallerOptions`;
// fluxnode-plan N1-N7). The attempt is the one engine: this only says, per run, what the chat would
// have said by default.
//
// - **The task key** is the name and spec hash, never the inputs: other inputs are the same task, and
//   find its saved Flow. `explore` runs under a key of its own, so it starts fresh and the task's
//   learned Flow is kept as it was, still the one an `auto` run uses. A pinned FluxNode's `auto` run
//   keeps what it changes under a key of its own too (`./caller-key.ts`, `./pin/`).
// - **The act scope** is the run's own execution (`./act-scope/`): the task key finds the saved Flow, and
//   the scope says whose landed acts are carried, so a run with new inputs, or the same inputs asked
//   again, lands its acts, and only a retry of the same idempotency key or a resume continues a record.
// - **The judge.** The type and the developer's check run before any judge, both through the check
//   bridge. `auto` means the judge only when there is no developer check, so a run with a declared type
//   and no check asks the attempt for `always`: the type is checked, then the judge. With neither a
//   type nor a check there is no bridge and the judge mode is passed as it is.
// - **The scope is the grant:** its act classes as Core's consequences, and its sites.
// - **The inputs** go with the attempt, so a saved Flow runs on them (`../answer-first/flow-run/`).

import type { FluxNodeActClass, FluxNodeResolvedOptions, FluxNodeSpec } from "@fluxiq/contracts/fluxnode";
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioActionConsequence } from "../../../../runtime/action-permission-requests/index.ts";
import type { AutomationStudioRunOverrides } from "../../../../runtime/run-overrides/index.ts";
import type { AutomationStudioAnswerFirstCallerOptions, AutomationStudioAnswerFirstPersonAskSink } from "../flow-bootstrap-commands/index.ts";
import { fluxNodeActScope } from "./act-scope/index.ts";
import { fluxNodeCallerKey } from "./caller-key.ts";
import type { FluxNodeCheckBridge } from "./events/index.ts";

const CONSEQUENCES: Readonly<Record<FluxNodeActClass, readonly AutomationStudioActionConsequence[]>> = Object.freeze({
  change: ["modify_existing", "create_new"],
  send: ["send_or_publish"],
  money: ["move_money"],
  delete: ["delete"]
});

export type FluxNodeCallerOptionsInput = {
  spec: Pick<FluxNodeSpec, "name" | "scope" | "hasCheck">;
  specHash: string;
  runId: string;
  /** The execution the run's lasting acts belong to (`./act-scope/`). Absent, the run's own. */
  actScope?: string | undefined;
  /** A continuation keeps the first attempt's task identity, including its explore/pin variant. */
  taskKey?: string | undefined;
  options: FluxNodeResolvedOptions;
  inputs: JsonObject;
  bridge: FluxNodeCheckBridge | undefined;
  personAsk: AutomationStudioAnswerFirstPersonAskSink;
  /** The run's judge criteria differ from those the Flow was last judged with: the judge runs again (unless it is off). */
  judgeChanged?: boolean | undefined;
  /** The FluxNode is pinned: an `auto` run keeps what it changes apart from the pinned Flow (`./pin/`). */
  pinned?: boolean | undefined;
  /** The overrides frame the run sets around the attempt, kept so a person's press on the attempt goes on under it. Never holds a secret. */
  runOverrides?: AutomationStudioRunOverrides | undefined;
};

export function fluxNodeCallerOptions(input: FluxNodeCallerOptionsInput): AutomationStudioAnswerFirstCallerOptions {
  const { spec, specHash, options, bridge } = input;
  const permittedConsequences = fluxNodePermittedConsequences(spec.scope.acts);
  const actScope = input.actScope ?? fluxNodeActScope({ runId: input.runId });
  return {
    taskKey: input.taskKey ?? fluxNodeCallerKey({ name: spec.name, specHash, ...(options.mode === "explore" ? { explore: actScope } : { pinned: input.pinned }) }),
    actScope,
    ...(options.model === undefined ? {} : { model: options.model }),
    budgetUsd: options.budgetUsd,
    judge: input.judgeChanged === true && options.judge !== "off" ? "always" : bridge && options.judge === "auto" && !spec.hasCheck ? "always" : options.judge,
    ...(bridge ? { check: bridge.check } : {}),
    // `humanness` lands on both option types with lane t898 (11252f094); this line does not typecheck until it merges.
    ...(options.humanness === undefined ? {} : { humanness: options.humanness }),
    personAsk: input.personAsk,
    scope: { permittedConsequences, ...(spec.scope.sites === undefined ? {} : { sites: [...spec.scope.sites] }) },
    inputs: structuredClone(input.inputs),
    ...(input.runOverrides === undefined ? {} : { runOverrides: structuredClone(input.runOverrides) })
  };
}

/** The consequences a scope's act classes grant, as the attempt's request is given them too. */
export function fluxNodePermittedConsequences(acts: readonly FluxNodeActClass[]): AutomationStudioActionConsequence[] {
  return [...new Set(acts.flatMap((act) => CONSEQUENCES[act]))];
}
